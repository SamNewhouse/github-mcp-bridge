import * as http from "node:http";
import { z } from "zod";
import { assertAuthorized } from "./auth";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import {
  getRequestUrl,
  readJsonBody,
  sendJson,
  sendJsonRpcError,
  sendJsonRpcResult,
} from "./lib/http";
import { createRequestLogger, sanitizeHeaders } from "./lib/logging";
import { executeTool, getToolList } from "./tools";
import type { McpToolResult } from "./tools/shared";

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const toolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

function isMcpToolResult(value: unknown): value is McpToolResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (!Array.isArray(candidate.content)) {
    return false;
  }

  return candidate.content.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const contentItem = item as Record<string, unknown>;
    return contentItem.type === "text" && typeof contentItem.text === "string";
  });
}

function toMcpToolResult(result: unknown): McpToolResult {
  if (isMcpToolResult(result)) {
    return result;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const log = createRequestLogger(req);

  try {
    log.info("request_received", {
      method: req.method ?? null,
      url: req.url ?? null,
      headers: sanitizeHeaders(req.headers),
    });

    const url = getRequestUrl(req);

    if (!url) {
      log.info("request_rejected", {
        reason: "missing_url",
      });

      return sendJson(res, 400, { error: "Missing URL" });
    }

    if (url.pathname === "/health") {
      log.info("health_check_ok", {
        path: url.pathname,
      });

      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname !== "/" && url.pathname !== "/mcp") {
      log.info("request_rejected", {
        path: url.pathname,
        reason: "not_found",
      });

      return sendJson(res, 404, { error: "Not found" });
    }

    if (req.method === "GET") {
      log.info("manifest_requested", {
        path: url.pathname,
      });

      return sendJson(res, 200, {
        name: "github-mcp-bridge",
        version: "0.1.0",
        tools: getToolList(),
      });
    }

    if (req.method !== "POST") {
      log.info("request_rejected", {
        path: url.pathname,
        method: req.method ?? null,
        reason: "method_not_allowed",
      });

      return sendJson(res, 405, { error: "Method not allowed" });
    }

    assertAuthorized(req, log);

    const rawBody = await readJsonBody(req);

    log.info("jsonrpc_raw_body", {
      rawBody,
    });

    const parsed = jsonRpcRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      log.warn("jsonrpc_invalid_request", {
        issues: parsed.error.issues,
      });

      return sendJsonRpcError(res, null, -32600, "Invalid Request", {
        issues: parsed.error.issues,
      });
    }

    const body = parsed.data;

    log.info("jsonrpc_request_received", {
      id: body.id ?? null,
      method: body.method,
    });

    if (body.method === "initialize") {
      const params =
        body.params && typeof body.params === "object"
          ? (body.params as Record<string, unknown>)
          : {};

      const protocolVersion =
        typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : "2025-03-26";

      const clientInfo =
        typeof params.clientInfo === "object" && params.clientInfo !== null
          ? params.clientInfo
          : null;

      log.info("initialize_succeeded", {
        id: body.id ?? null,
        clientInfo,
      });

      return sendJsonRpcResult(res, body.id ?? null, {
        protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "github-mcp-bridge",
          version: "0.1.0",
        },
      });
    }

    if (body.method === "notifications/initialized") {
      log.info("initialized_notification_received", {
        id: body.id ?? null,
      });

      res.statusCode = 202;
      res.end();
      return;
    }

    if (body.method === "tools/list") {
      log.info("tools_list_requested", {
        id: body.id ?? null,
      });

      return sendJsonRpcResult(res, body.id ?? null, {
        tools: getToolList(),
      });
    }

    if (body.method === "tools/call") {
      const params = toolCallParamsSchema.safeParse(body.params);

      if (!params.success) {
        log.warn("jsonrpc_invalid_params", {
          id: body.id ?? null,
          method: body.method,
          issues: params.error.issues,
        });

        return sendJsonRpcError(res, body.id ?? null, -32602, "Invalid params", {
          issues: params.error.issues,
        });
      }

      const toolName = params.data.name;
      const toolArgs = params.data.arguments;

      log.info("tool_invocation_started", {
        id: body.id ?? null,
        tool: toolName,
      });

      try {
        log.info("tool_invocation_payload", {
          id: body.id ?? null,
          tool: toolName,
          arguments: toolArgs,
        });

        const result = await executeTool(toolName, toolArgs);
        const mcpResult = toMcpToolResult(result);

        log.info("tool_invocation_succeeded", {
          id: body.id ?? null,
          tool: toolName,
        });

        return sendJsonRpcResult(res, body.id ?? null, mcpResult);
      } catch (error) {
        const message = getErrorMessage(error);

        log.error("tool_invocation_failed", {
          id: body.id ?? null,
          tool: toolName,
          message,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });

        return sendJsonRpcError(res, body.id ?? null, -32603, "Internal error", {
          tool: toolName,
          message,
        });
      }
    }

    log.warn("jsonrpc_method_not_found", {
      id: body.id ?? null,
      method: body.method,
    });

    return sendJsonRpcError(res, body.id ?? null, -32601, "Method not found");
  } catch (error) {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error);

    log.error("request_failed", {
      method: req.method ?? null,
      url: req.url ?? null,
      status,
      message,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return sendJsonRpcError(res, null, -32603, "Internal error", {
      message,
    });
  }
}

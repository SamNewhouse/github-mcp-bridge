import * as http from "node:http";
import { z } from "zod";
import { assertAuthorized, getAuthorizedPrincipal } from "./auth";
import {
  getClientIp,
  isRateLimited,
  recordAuthFailure,
  recordAuthSuccess,
} from "./lib/limiter";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import {
  getRequestUrl,
  readJsonBody,
  sendJson,
  sendJsonRpcError,
  sendJsonRpcResultWithSession,
} from "./lib/http";
import { createRequestLogger } from "./lib/logging";
import {
  getOrCreateSessionForPrincipal,
  getSessionIdFromHeaders,
  touchSession,
  validateSession,
} from "./lib/session";
import { getSplashHtml } from "./splash";
import { executeTool, getToolList } from "./tools";
import type { McpToolResult } from "./tools/shared";

const RPC_UNAUTHORIZED = -32001;
const SUPPORTED_PROTOCOL_VERSION = "2025-03-26";

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

function sendSplashPage(res: http.ServerResponse): void {
  const html = getSplashHtml(getToolList().length);
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'none'",
  );
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.end(html);
}

function resolveProtocolVersion(_: unknown): string {
  return SUPPORTED_PROTOCOL_VERSION;
}

function resolveSession(principal: string, headers: http.IncomingHttpHeaders) {
  const requestedSessionId = getSessionIdFromHeaders(headers);
  const hasValidRequestedSession =
    requestedSessionId !== null &&
    validateSession(requestedSessionId, principal);

  const sessionId = hasValidRequestedSession
    ? requestedSessionId
    : getOrCreateSessionForPrincipal(principal);

  touchSession(sessionId);

  return {
    sessionId,
    requestedSessionId,
    hasValidRequestedSession,
    autoResumed: !hasValidRequestedSession,
  };
}

export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const log = createRequestLogger(req);

  try {
    const url = getRequestUrl(req);

    if (!url) {
      log.warn("request_rejected", { reason: "missing_url" });
      return sendJson(res, 400, { error: "Missing URL" });
    }

    if (url.pathname === "/health") {
      try {
        assertAuthorized(req, log);
      } catch {
        return sendJson(res, 401, { error: "Unauthorized" });
      }

      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/" && req.method === "HEAD") {
      try {
        assertAuthorized(req, log);
      } catch {
        res.statusCode = 401;
        res.end();
        return;
      }

      res.statusCode = 200;
      res.end();
      return;
    }

    if (url.pathname === "/" && req.method === "GET") {
      const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;

      if (acceptsHtml) {
        return sendSplashPage(res);
      }

      log.warn("request_rejected", {
        path: url.pathname,
        method: req.method ?? null,
        reason: "method_not_allowed",
      });
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    if (url.pathname !== "/") {
      log.warn("request_rejected", {
        path: url.pathname,
        reason: "not_found",
      });
      return sendJson(res, 404, { error: "Not found" });
    }

    const clientIp = getClientIp(req);

    if (isRateLimited(clientIp)) {
      log.warn("authorization_rate_limited", {
        method: req.method ?? null,
        url: req.url ?? null,
        ip: clientIp,
      });
      return sendJsonRpcError(
        res,
        null,
        RPC_UNAUTHORIZED,
        "Too many failed attempts — try again later",
      );
    }

    let principal: string;

    try {
      principal = getAuthorizedPrincipal(req, log);
      recordAuthSuccess(clientIp);
    } catch {
      recordAuthFailure(clientIp);
      return sendJsonRpcError(res, null, RPC_UNAUTHORIZED, "Unauthorized");
    }

    if (req.method !== "POST") {
      log.warn("request_rejected", {
        path: url.pathname,
        method: req.method ?? null,
        reason: "method_not_allowed",
      });
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const rawBody = await readJsonBody(req);
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
    const session = resolveSession(principal, req.headers);

    if (body.method === "initialize") {
      const protocolVersion = resolveProtocolVersion(body.params);

      log.info("mcp_session_initialized", {
        id: body.id ?? null,
        sessionId: session.sessionId,
        protocolVersion,
        resumed: !session.autoResumed,
        requestedSessionId: session.requestedSessionId,
        autoResumed: session.autoResumed,
      });

      return sendJsonRpcResultWithSession(
        res,
        body.id ?? null,
        {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "github-mcp-bridge", version: "0.1.0" },
        },
        session.sessionId,
      );
    }

    if (body.method === "ping") {
      return sendJsonRpcResultWithSession(
        res,
        body.id ?? null,
        {},
        session.sessionId,
      );
    }

    if (body.method === "notifications/initialized") {
      res.statusCode = 202;
      res.setHeader("mcp-session-id", session.sessionId);
      res.end();
      return;
    }

    if (body.method === "tools/list") {
      const tools = getToolList();

      log.info("tools_list_requested", {
        id: body.id ?? null,
        sessionId: session.sessionId,
        requestedSessionId: session.requestedSessionId,
        clientSuppliedValidSession: session.hasValidRequestedSession,
        autoResumed: session.autoResumed,
        toolCount: tools.length,
        toolNames: tools.map((tool) => tool.name),
      });

      return sendJsonRpcResultWithSession(
        res,
        body.id ?? null,
        { tools },
        session.sessionId,
      );
    }

    if (body.method === "tools/call") {
      const params = toolCallParamsSchema.safeParse(body.params);

      if (!params.success) {
        log.warn("jsonrpc_invalid_params", {
          id: body.id ?? null,
          method: body.method,
          issues: params.error.issues,
          sessionId: session.sessionId,
        });
        return sendJsonRpcError(
          res,
          body.id ?? null,
          -32602,
          "Invalid params",
          { issues: params.error.issues },
        );
      }

      const toolName = params.data.name;
      const toolArgs = params.data.arguments;

      try {
        const result = await executeTool(toolName, toolArgs);
        const mcpResult = toMcpToolResult(result);

        return sendJsonRpcResultWithSession(
          res,
          body.id ?? null,
          mcpResult,
          session.sessionId,
        );
      } catch (error) {
        const status = getErrorStatus(error);
        const message = getErrorMessage(error);

        log.error("tool_invocation_failed", {
          id: body.id ?? null,
          tool: toolName,
          status,
          message,
          sessionId: session.sessionId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });

        if (status === 400) {
          return sendJsonRpcError(
            res,
            body.id ?? null,
            -32602,
            "Invalid params",
            { tool: toolName, message },
          );
        }

        if (status === 401) {
          return sendJsonRpcError(
            res,
            body.id ?? null,
            RPC_UNAUTHORIZED,
            "Unauthorized",
            { tool: toolName, message },
          );
        }

        return sendJsonRpcError(
          res,
          body.id ?? null,
          -32603,
          "Internal error",
          { tool: toolName, message },
        );
      }
    }

    log.warn("jsonrpc_method_not_found", {
      id: body.id ?? null,
      method: body.method,
      sessionId: session.sessionId,
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

    return sendJsonRpcError(res, null, -32603, "Internal error", { message });
  }
}

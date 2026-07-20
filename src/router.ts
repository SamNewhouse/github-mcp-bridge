import * as http from "node:http";
import { assertAuthorized } from "./auth";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import { getRequestUrl, readJsonBody, sendJson } from "./lib/http";
import { createRequestLogger, sanitizeHeaders } from "./lib/logging";
import { executeTool, getToolList, toolRequestSchema } from "./tools";

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

    if (url.pathname !== "/") {
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

    assertAuthorized(req);

    if (req.method !== "POST") {
      log.info("request_rejected", {
        path: url.pathname,
        method: req.method ?? null,
        reason: "method_not_allowed",
      });

      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const rawBody = await readJsonBody(req);
    const body = toolRequestSchema.parse(rawBody);

    log.info("tool_invocation_started", {
      tool: body.tool,
    });

    const result = await executeTool(body.tool, body.input);

    log.info("tool_invocation_succeeded", {
      tool: body.tool,
    });

    return sendJson(res, 200, {
      tool: body.tool,
      result,
    });
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

    return sendJson(res, status, {
      error: message,
    });
  }
}

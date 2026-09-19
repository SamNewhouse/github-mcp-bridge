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
  createSession,
  deleteSessionForPrincipal,
  getSessionIdFromHeaders,
  touchSessionForPrincipal,
} from "./lib/session";
import { getSplashHtml } from "./splash";
import { executeTool, getToolList } from "./tools";
import type { McpToolResult } from "./tools/shared";

const RPC_UNAUTHORIZED = -32001;
const RPC_SESSION_REQUIRED = -32002;
const SUPPORTED_PROTOCOL_VERSION = "2025-03-26";

const CACHED_TOOL_LIST = getToolList();
const CACHED_TOOL_LIST_RESPONSE = { tools: CACHED_TOOL_LIST };

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

/**
 * Determines whether a value already has the MCP tool-result shape.
 *
 * @param value - The value to inspect.
 * @returns `true` when the value contains only valid text content items.
 */
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

/**
 * Converts a tool result into the MCP tool-result format.
 *
 * Existing MCP results are returned unchanged. Other values are represented
 * as formatted JSON text and exposed through `structuredContent`.
 *
 * @param result - The raw tool result.
 * @returns A normalized MCP tool result.
 */
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

/**
 * Sends the public splash page response.
 *
 * @param res - The HTTP response to populate.
 */
function sendSplashPage(res: http.ServerResponse): void {
  const html = getSplashHtml(CACHED_TOOL_LIST.length);

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

/**
 * Resolves the MCP protocol version supported by this server.
 *
 * @param _params - Client-supplied initialization parameters.
 * @returns The supported MCP protocol version.
 */
function resolveProtocolVersion(_params: unknown): string {
  return SUPPORTED_PROTOCOL_VERSION;
}

/**
 * Resolves or creates a session for the initialize request.
 *
 * If the client supplied a valid session ID, it is resumed and its idle
 * window is refreshed. Otherwise a new session is created.
 *
 * @param principal - The authenticated request principal.
 * @param headers - The incoming request headers.
 * @returns Session information used during initialization.
 */
async function resolveInitialSession(
  principal: string,
  headers: http.IncomingHttpHeaders,
) {
  const requestedSessionId = getSessionIdFromHeaders(headers);

  if (
    requestedSessionId !== null &&
    (await touchSessionForPrincipal(requestedSessionId, principal))
  ) {
    return {
      sessionId: requestedSessionId,
      requestedSessionId,
      hasValidRequestedSession: true,
      autoResumed: false,
    };
  }

  return {
    sessionId: await createSession(principal),
    requestedSessionId,
    hasValidRequestedSession: false,
    autoResumed: true,
  };
}

/**
 * Requires a valid session ID for post-initialization MCP requests.
 *
 * Validates the session against the principal and slides its idle expiry
 * forward in a single store round trip.
 *
 * @param principal - The authenticated request principal.
 * @param headers - The incoming request headers.
 * @returns The validated session ID, or null when the session is missing,
 * expired, or belongs to a different principal.
 */
async function requireSession(
  principal: string,
  headers: http.IncomingHttpHeaders,
): Promise<string | null> {
  const sessionId = getSessionIdFromHeaders(headers);

  if (!sessionId || !(await touchSessionForPrincipal(sessionId, principal))) {
    return null;
  }

  return sessionId;
}

/**
 * Handles an incoming MCP HTTP request.
 *
 * @param req - The incoming HTTP request.
 * @param res - The outgoing HTTP response.
 * @returns A promise that resolves when the response has been sent.
 */
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

    if (req.method === "DELETE") {
      const sessionId = getSessionIdFromHeaders(req.headers);

      if (!sessionId) {
        log.warn("session_delete_rejected", {
          reason: "missing_session_id",
        });

        return sendJson(res, 400, { error: "Missing MCP session ID" });
      }

      const deleted = await deleteSessionForPrincipal(sessionId, principal);

      if (!deleted) {
        log.warn("session_delete_rejected", {
          reason: "invalid_or_expired_session",
          sessionId,
        });

        return sendJson(res, 404, { error: "Session not found" });
      }

      log.info("mcp_session_deleted", {
        sessionId,
      });

      res.statusCode = 204;
      res.setHeader("mcp-session-id", sessionId);
      res.end();
      return;
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

      return sendJsonRpcError(
        res,
        null,
        -32600,
        "Invalid Request",
        { issues: parsed.error.issues },
        400,
      );
    }

    const body = parsed.data;

    if (body.method === "initialize") {
      const session = await resolveInitialSession(principal, req.headers);
      const protocolVersion = resolveProtocolVersion(body.params);

      const logData = {
        id: body.id ?? null,
        sessionId: session.sessionId,
        protocolVersion,
        resumed: !session.autoResumed,
        requestedSessionId: session.requestedSessionId,
        autoResumed: session.autoResumed,
      };

      if (session.autoResumed) {
        (log as any).debug?.("mcp_session_auto_resumed", logData);
      } else {
        log.info("mcp_session_initialized", logData);
      }

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

    const sessionId = await requireSession(principal, req.headers);

    if (!sessionId) {
      log.warn("mcp_session_required", {
        id: body.id ?? null,
        method: body.method,
      });

      return sendJsonRpcError(
        res,
        body.id ?? null,
        RPC_SESSION_REQUIRED,
        "MCP session required",
        {
          message:
            "Call initialize first and include the returned Mcp-Session-Id header.",
        },
      );
    }

    if (body.method === "ping") {
      return sendJsonRpcResultWithSession(res, body.id ?? null, {}, sessionId);
    }

    if (body.method === "notifications/initialized") {
      res.statusCode = 202;
      res.setHeader("mcp-session-id", sessionId);
      res.end();
      return;
    }

    if (body.method === "tools/list") {
      log.info("tools_list_requested", {
        id: body.id ?? null,
        sessionId,
        clientSuppliedValidSession: true,
        autoResumed: false,
        toolCount: CACHED_TOOL_LIST.length,
        toolNames: CACHED_TOOL_LIST.map((tool) => tool.name),
      });

      return sendJsonRpcResultWithSession(
        res,
        body.id ?? null,
        CACHED_TOOL_LIST_RESPONSE,
        sessionId,
      );
    }

    if (body.method === "tools/call") {
      const params = toolCallParamsSchema.safeParse(body.params);

      if (!params.success) {
        log.warn("jsonrpc_invalid_params", {
          id: body.id ?? null,
          method: body.method,
          issues: params.error.issues,
          sessionId,
        });

        return sendJsonRpcError(
          res,
          body.id ?? null,
          -32602,
          "Invalid params",
          { issues: params.error.issues },
          400,
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
          sessionId,
        );
      } catch (error) {
        const status = getErrorStatus(error);
        const message = getErrorMessage(error);

        log.error("tool_invocation_failed", {
          id: body.id ?? null,
          tool: toolName,
          status,
          message,
          sessionId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });

        if (status === 400) {
          return sendJsonRpcError(
            res,
            body.id ?? null,
            -32602,
            "Invalid params",
            { tool: toolName, message },
            400,
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
      sessionId,
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

import * as http from "node:http";
import { assertAuthorized, getAuthorizedPrincipal } from "./auth";
import { runWithRequestContext } from "./github/request-context";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import { getRequestUrl, readJsonBody, sendJson, sendJsonRpcError, sendJsonRpcResultWithSession } from "./lib/http";
import { getClientIp, isRateLimited, recordAuthFailure, recordAuthSuccess } from "./lib/limiter";
import { createRequestLogger } from "./lib/logging";
import { RPC_SESSION_REQUIRED, RPC_UNAUTHORIZED, SUPPORTED_PROTOCOL_VERSION, toMcpToolResult } from "./lib/mcp-protocol";
import { createRequestContext } from "./lib/request-context";
import { createSession, deleteSessionForPrincipal, getSessionIdFromHeaders, touchSessionForPrincipal } from "./lib/session";
import { getSplashHtml } from "./splash";
import { executeTool, getToolList } from "./tools";
import { jsonRpcRequestSchema, toolCallParamsSchema } from "./lib/validation";

const CACHED_TOOL_LIST = getToolList();
const CACHED_TOOL_LIST_RESPONSE = { tools: CACHED_TOOL_LIST };

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
 * Returns the MCP protocol version supported by this server.
 *
 * @param _params - Client-supplied initialization parameters.
 * @returns The supported protocol version.
 */
function resolveProtocolVersion(_params: unknown): string {
  return SUPPORTED_PROTOCOL_VERSION;
}

/**
 * Resolves an existing valid MCP session or creates a new one.
 *
 * The MCP session remains a protocol-level transport concern. It is not used
 * for cache scoping: the operation cache instead uses principal +
 * X-Request-Id, which remains stable across the short MCP sessions created by
 * the connector.
 *
 * @param principal - The authenticated request principal.
 * @param headers - Incoming HTTP headers.
 * @returns The resolved MCP session information.
 */
async function resolveInitialSession(principal: string, headers: http.IncomingHttpHeaders) {
  const requestedSessionId = getSessionIdFromHeaders(headers);

  if (requestedSessionId !== null && (await touchSessionForPrincipal(requestedSessionId, principal))) {
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
 * Requires a valid session for a post-initialize MCP request.
 *
 * @param principal - The authenticated caller.
 * @param headers - Incoming HTTP headers.
 * @returns The valid session ID, or null when it is absent, invalid, or expired.
 */
async function requireSession(principal: string, headers: http.IncomingHttpHeaders): Promise<string | null> {
  const sessionId = getSessionIdFromHeaders(headers);

  if (!sessionId || !(await touchSessionForPrincipal(sessionId, principal))) {
    return null;
  }

  return sessionId;
}

/**
 * Handles an incoming MCP HTTP request.
 *
 * MCP session state validates the transport conversation. The independent
 * request context is derived from the authenticated caller plus the upstream
 * X-Request-Id and scopes the temporary Redis GitHub response cache.
 *
 * @param req - The incoming HTTP request.
 * @param res - The outgoing HTTP response.
 */
export async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const log = createRequestLogger(req);

  try {
    const url = getRequestUrl(req);

    if (!url) {
      log.warn("request_rejected", {
        reason: "missing_url",
      });

      return sendJson(res, 400, {
        error: "Missing URL",
      });
    }

    if (url.pathname === "/health") {
      try {
        assertAuthorized(req, log);
      } catch {
        return sendJson(res, 401, {
          error: "Unauthorized",
        });
      }

      return sendJson(res, 200, {
        ok: true,
      });
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

      return sendJson(res, 405, {
        error: "Method not allowed",
      });
    }

    if (url.pathname !== "/") {
      log.warn("request_rejected", {
        path: url.pathname,
        reason: "not_found",
      });

      return sendJson(res, 404, {
        error: "Not found",
      });
    }

    const clientIp = getClientIp(req);

    if (isRateLimited(clientIp)) {
      log.warn("authorization_rate_limited", {
        method: req.method ?? null,
        url: req.url ?? null,
        ip: clientIp,
      });

      return sendJsonRpcError(res, null, RPC_UNAUTHORIZED, "Too many failed attempts — try again later");
    }

    let principal: string;

    try {
      principal = getAuthorizedPrincipal(req, log);
      recordAuthSuccess(clientIp);
    } catch {
      recordAuthFailure(clientIp);

      return sendJsonRpcError(res, null, RPC_UNAUTHORIZED, "Unauthorized");
    }

    const requestContext = createRequestContext(req.headers, principal);

    if (req.method === "DELETE") {
      const sessionId = getSessionIdFromHeaders(req.headers);

      if (!sessionId) {
        log.warn("session_delete_rejected", {
          reason: "missing_session_id",
          requestId: requestContext?.requestId ?? null,
        });

        return sendJson(res, 400, {
          error: "Missing MCP session ID",
        });
      }

      const deleted = await deleteSessionForPrincipal(sessionId, principal);

      if (!deleted) {
        log.warn("session_delete_rejected", {
          reason: "invalid_or_expired_session",
          sessionId,
          requestId: requestContext?.requestId ?? null,
        });

        return sendJson(res, 404, {
          error: "Session not found",
        });
      }

      log.info("mcp_session_deleted", {
        sessionId,
        requestId: requestContext?.requestId ?? null,
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

      return sendJson(res, 405, {
        error: "Method not allowed",
      });
    }

    const rawBody = await readJsonBody(req);
    const parsed = jsonRpcRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      log.warn("jsonrpc_invalid_request", {
        issues: parsed.error.issues,
        requestId: requestContext?.requestId ?? null,
      });

      return sendJsonRpcError(
        res,
        null,
        -32600,
        "Invalid Request",
        {
          issues: parsed.error.issues,
        },
        400,
      );
    }

    const body = parsed.data;

    if (body.method === "initialize") {
      const session = await resolveInitialSession(principal, req.headers);
      const protocolVersion = resolveProtocolVersion(body.params);

      log.info("mcp_session_initialized", {
        id: body.id ?? null,
        sessionId: session.sessionId,
        requestId: requestContext?.requestId ?? null,
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
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "github-mcp-bridge",
            version: "0.1.0",
          },
        },
        session.sessionId,
      );
    }

    const sessionId = await requireSession(principal, req.headers);

    if (!sessionId) {
      log.warn("mcp_session_required", {
        id: body.id ?? null,
        method: body.method,
        requestId: requestContext?.requestId ?? null,
      });

      return sendJsonRpcError(res, body.id ?? null, RPC_SESSION_REQUIRED, "MCP session required", {
        message: "Call initialize first and include the returned Mcp-Session-Id header.",
      });
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
        requestId: requestContext?.requestId ?? null,
        toolCount: CACHED_TOOL_LIST.length,
        toolNames: CACHED_TOOL_LIST.map((tool) => tool.name),
      });

      return sendJsonRpcResultWithSession(res, body.id ?? null, CACHED_TOOL_LIST_RESPONSE, sessionId);
    }

    if (body.method === "tools/call") {
      const params = toolCallParamsSchema.safeParse(body.params);

      if (!params.success) {
        log.warn("jsonrpc_invalid_params", {
          id: body.id ?? null,
          method: body.method,
          issues: params.error.issues,
          sessionId,
          requestId: requestContext?.requestId ?? null,
        });

        return sendJsonRpcError(
          res,
          body.id ?? null,
          -32602,
          "Invalid params",
          {
            issues: params.error.issues,
          },
          400,
        );
      }

      const toolName = params.data.name;
      const toolArgs = params.data.arguments;

      try {
        const result = await runWithRequestContext(requestContext, () => executeTool(toolName, toolArgs));

        const mcpResult = toMcpToolResult(result);

        return sendJsonRpcResultWithSession(res, body.id ?? null, mcpResult, sessionId);
      } catch (error) {
        const status = getErrorStatus(error);
        const message = getErrorMessage(error);

        log.error("tool_invocation_failed", {
          id: body.id ?? null,
          tool: toolName,
          status,
          message,
          sessionId,
          requestId: requestContext?.requestId ?? null,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });

        if (status === 400) {
          return sendJsonRpcError(
            res,
            body.id ?? null,
            -32602,
            "Invalid params",
            {
              tool: toolName,
              message,
            },
            400,
          );
        }

        if (status === 401) {
          return sendJsonRpcError(res, body.id ?? null, RPC_UNAUTHORIZED, "Unauthorized", {
            tool: toolName,
            message,
          });
        }

        return sendJsonRpcError(res, body.id ?? null, -32603, "Internal error", {
          tool: toolName,
          message,
        });
      }
    }

    log.warn("jsonrpc_method_not_found", {
      id: body.id ?? null,
      method: body.method,
      sessionId,
      requestId: requestContext?.requestId ?? null,
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

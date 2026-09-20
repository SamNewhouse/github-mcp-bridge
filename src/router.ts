import * as http from "node:http";
import { assertAuthorized, getAuthorizedPrincipal } from "./auth";
import { runWithRequestContext } from "./github/request-context";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import { readJsonBody, sendJson, sendJsonRpcError, sendJsonRpcResultWithSession } from "./lib/http";
import { getClientIp, isRateLimited, recordAuthFailure, recordAuthSuccess } from "./lib/limiter";
import { createRequestLogger } from "./lib/logging";
import { RPC_UNAUTHORIZED, SUPPORTED_PROTOCOL_VERSION, toMcpToolResult } from "./lib/mcp-protocol";
import { createRequestContext } from "./lib/request-context";
import { createSession, getSessionIdFromHeaders, touchSessionForPrincipal } from "./lib/session";
import { sendSplashPage } from "./splash";
import { executeTool, getToolList } from "./tools";
import { jsonRpcRequestSchema, toolCallParamsSchema } from "./lib/validation";
import { createRouter, type Router } from "./lib/router";

export const CACHED_TOOL_LIST = getToolList();
const CACHED_TOOL_LIST_RESPONSE = { tools: CACHED_TOOL_LIST };

function resolveProtocolVersion(_params: unknown): string {
  return SUPPORTED_PROTOCOL_VERSION;
}

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

export async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const log = createRequestLogger(req);

  const router: Router = createRouter();

  // Health check (authorized)
  router.set("GET", "/health", async (req, res, log) => {
    try {
      assertAuthorized(req, log);
    } catch {
      return sendJson(res, 401, { error: "Unauthorized" });
    }
    return sendJson(res, 200, { ok: true });
  });

  // Root: HEAD
  router.set("HEAD", "/", async (req, res, log) => {
    try {
      assertAuthorized(req, log);
    } catch {
      res.statusCode = 401;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.end();
  });

  // Root: GET (splash or 405)
  router.set("GET", "/", async (req, res, log) => {
    const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;
    if (acceptsHtml) {
      return sendSplashPage(res);
    }

    log.warn("request_rejected", {
      path: "/",
      method: "GET",
      reason: "method_not_allowed",
    });

    return sendJson(res, 405, { error: "Method not allowed" });
  });

  // cache delete (DELETE /) – no longer touches sessions.
  // Operation cache is scoped by requestId and expires via TTL only.
  router.set("DELETE", "/", async (req, res, log) => {
    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
      log.warn("authorization_rate_limited", {
        method: "DELETE",
        url: req.url ?? null,
        ip: clientIp,
      });
      return sendJson(res, 429, { error: "Too many failed attempts — try again later" });
    }

    let principal: string;
    try {
      principal = getAuthorizedPrincipal(req, log);
      recordAuthSuccess(clientIp);
    } catch {
      recordAuthFailure(clientIp);
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    const requestContext = createRequestContext(req.headers, principal);
    const requestId = requestContext?.requestId ?? null;

    log.info("mcp_delete_acknowledged", {
      requestId,
      note: "Operation cache is scoped by requestId and expires via 5‑minute TTL; no explicit deletion.",
    });

    res.statusCode = 204;
    res.setHeader("mcp-session-id", "no-session");
    res.end();
  });

  // Main JSON-RPC endpoint (POST /)
  router.set("POST", "/", async (req, res, log) => {
    const clientIp = getClientIp(req);

    if (isRateLimited(clientIp)) {
      log.warn("authorization_rate_limited", {
        method: "POST",
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
    const requestId = requestContext?.requestId ?? null;

    const rawBody = await readJsonBody(req);
    const parsed = jsonRpcRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      log.warn("jsonrpc_invalid_request", {
        issues: parsed.error.issues,
        requestId,
      });

      return sendJsonRpcError(res, null, -32600, "Invalid Request", { issues: parsed.error.issues }, 400);
    }

    const body = parsed.data;

    // We no longer enforce or rely on a valid MCP session for tool calls.
    // The real operation scope is requestContext (principal + X-Request-Id).
    // For responses we just send a constant dummy session value.
    const dummySessionId = "no-session";

    type MethodHandler = () => Promise<void>;

    const methods: Record<string, MethodHandler> = {
      initialize: async () => {
        const session = await resolveInitialSession(principal, req.headers);
        const protocolVersion = resolveProtocolVersion(body.params);

        log.info("mcp_session_initialized", {
          id: body.id ?? null,
          sessionId: session.sessionId,
          requestId,
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
      },

      ping: async () => {
        return sendJsonRpcResultWithSession(res, body.id ?? null, {}, dummySessionId);
      },

      notifications_initialized: async () => {
        res.statusCode = 202;
        res.setHeader("mcp-session-id", dummySessionId);
        res.end();
      },

      tools_list: async () => {
        log.info("tools_list_requested", {
          id: body.id ?? null,
          requestId,
          toolCount: CACHED_TOOL_LIST.length,
          toolNames: CACHED_TOOL_LIST.map((t) => t.name),
        });

        return sendJsonRpcResultWithSession(res, body.id ?? null, CACHED_TOOL_LIST_RESPONSE, dummySessionId);
      },

      tools_call: async () => {
        const params = toolCallParamsSchema.safeParse(body.params);

        if (!params.success) {
          log.warn("jsonrpc_invalid_params", {
            id: body.id ?? null,
            method: body.method,
            issues: params.error.issues,
            requestId,
          });

          return sendJsonRpcError(res, body.id ?? null, -32602, "Invalid params", { issues: params.error.issues }, 400);
        }

        const toolName = params.data.name;
        const toolArgs = params.data.arguments;

        try {
          const result = await runWithRequestContext(requestContext, () => executeTool(toolName, toolArgs));
          const mcpResult = toMcpToolResult(result);
          return sendJsonRpcResultWithSession(res, body.id ?? null, mcpResult, dummySessionId);
        } catch (error) {
          const status = getErrorStatus(error);
          const message = getErrorMessage(error);

          log.error("tool_invocation_failed", {
            id: body.id ?? null,
            tool: toolName,
            status,
            message,
            requestId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });

          if (status === 400) {
            return sendJsonRpcError(res, body.id ?? null, -32602, "Invalid params", { tool: toolName, message }, 400);
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
      },
    };

    // Normalize MCP method names to handler keys.
    const methodKey = body.method.replace("/", "_");

    const handler = methods[methodKey];
    if (!handler) {
      log.warn("jsonrpc_method_not_found", {
        id: body.id ?? null,
        method: body.method,
        requestId,
      });

      return sendJsonRpcError(res, body.id ?? null, -32601, "Method not found");
    }

    return handler();
  });

  return router.handle(req, res, log);
}

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

const TOOL_COUNT = getToolList().length;

function sendSplashPage(res: http.ServerResponse): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>github-mcp-bridge</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0d0d0d;
      --surface: #141414;
      --border: rgba(255,255,255,0.08);
      --text: #e8e8e6;
      --muted: #6b6b68;
      --faint: #3a3a38;
      --accent: #4f98a3;
      --accent-glow: rgba(79,152,163,0.15);
      --green: #6daa45;
      --radius: 0.5rem;
    }
    html { -webkit-font-smoothing: antialiased; }
    body {
      min-height: 100dvh;
      background: var(--bg);
      color: var(--text);
      font-family: 'Geist', system-ui, sans-serif;
      display: grid;
      place-items: center;
      padding: 2rem 1.5rem;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) * 2);
      padding: 2.5rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }
    .logo-mark {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }
    .logo-text {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .logo-name {
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text);
    }
    .logo-sub {
      font-size: 0.75rem;
      color: var(--muted);
      font-family: 'Geist Mono', monospace;
    }
    .divider {
      height: 1px;
      background: var(--border);
    }
    .status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      color: var(--green);
      font-family: 'Geist Mono', monospace;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 6px var(--green);
      animation: pulse 2.4s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .meta-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.75rem 1rem;
    }
    .meta-label {
      font-size: 0.6875rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.3rem;
      font-family: 'Geist Mono', monospace;
    }
    .meta-value {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--text);
      font-family: 'Geist Mono', monospace;
    }
    .meta-value.accent { color: var(--accent); }
    .footer {
      font-size: 0.75rem;
      color: var(--faint);
      text-align: center;
      font-family: 'Geist Mono', monospace;
      line-height: 1.6;
    }
    .footer a {
      color: var(--muted);
      text-decoration: none;
      transition: color 180ms ease;
    }
    .footer a:hover { color: var(--accent); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg class="logo-mark" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="github-mcp-bridge logo">
        <rect width="40" height="40" rx="10" fill="#1a1a1a"/>
        <!-- Bridge arches -->
        <path d="M6 26 Q13 14 20 26" stroke="#4f98a3" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M20 26 Q27 14 34 26" stroke="#4f98a3" stroke-width="2" stroke-linecap="round" fill="none"/>
        <!-- Bridge deck -->
        <line x1="4" y1="26" x2="36" y2="26" stroke="#4f98a3" stroke-width="2" stroke-linecap="round"/>
        <!-- Vertical supports -->
        <line x1="13" y1="26" x2="13" y2="30" stroke="#4f98a3" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="20" y1="26" x2="20" y2="30" stroke="#4f98a3" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="27" y1="26" x2="27" y2="30" stroke="#4f98a3" stroke-width="1.5" stroke-linecap="round"/>
        <!-- MCP dot -->        
        <circle cx="20" cy="13" r="2.5" fill="#6daa45"/>
      </svg>
      <div class="logo-text">
        <span class="logo-name">github-mcp-bridge</span>
        <span class="logo-sub">Model Context Protocol Server</span>
      </div>
    </div>

    <div class="divider"></div>

    <div class="status">
      <div class="status-dot"></div>
      operational
    </div>

    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Tools</div>
        <div class="meta-value accent">${TOOL_COUNT}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Protocol</div>
        <div class="meta-value">MCP 2025</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Transport</div>
        <div class="meta-value">HTTP/JSON-RPC</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Runtime</div>
        <div class="meta-value">Node 24</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="footer">
      Requests require a valid <code>Authorization: Bearer</code> token<br>
      <a href="https://github.com/SamNewhouse/github-mcp-bridge" target="_blank" rel="noopener noreferrer">github.com/SamNewhouse/github-mcp-bridge</a>
    </div>
  </div>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
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

    // Public splash page — no auth required
    if (url.pathname === "/" && req.method === "GET") {
      const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;

      if (acceptsHtml) {
        log.info("splash_page_served", { path: url.pathname });
        return sendSplashPage(res);
      }
    }

    if (url.pathname !== "/") {
      log.info("request_rejected", {
        path: url.pathname,
        reason: "not_found",
      });

      return sendJson(res, 404, { error: "Not found" });
    }

    assertAuthorized(req, log);

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

        return sendJsonRpcError(
          res,
          body.id ?? null,
          -32602,
          "Invalid params",
          {
            issues: params.error.issues,
          },
        );
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

        return sendJsonRpcError(
          res,
          body.id ?? null,
          -32603,
          "Internal error",
          {
            tool: toolName,
            message,
          },
        );
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

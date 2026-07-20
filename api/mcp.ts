import http from "node:http";
import { env } from "../src/config";
import { assertAuthorized } from "../src/auth";
import { toolDefinitions, type ToolName } from "../src/tools";

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    if (!req.url) {
      return sendJson(res, 400, { error: "Missing URL" });
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname !== "/mcp") {
      return sendJson(res, 404, { error: "Not found" });
    }

    assertAuthorized(req);

    if (req.method === "GET") {
      return sendJson(res, 200, {
        name: "github-mcp-bridge",
        version: "0.1.0",
        tools: Object.entries(toolDefinitions).map(([name, def]) => ({
          name,
          description: def.description,
          inputSchema: def.inputSchema,
        })),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const body = (await readJsonBody(req)) as {
      tool?: ToolName;
      input?: unknown;
    };
    const toolName = body.tool;

    if (!toolName || !(toolName in toolDefinitions)) {
      return sendJson(res, 400, { error: "Unknown or missing tool" });
    }

    const tool = toolDefinitions[toolName];
    const result = await tool.handler(body.input);
    return sendJson(res, 200, { tool: toolName, result });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;

    const message =
      error instanceof Error ? error.message : "Internal server error";
    return sendJson(res, status, { error: message });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = env.PORT;
  const server = http.createServer(handleMcpRequest);

  server.listen(port, () => {
    console.log(`github-mcp-bridge listening on http://localhost:${port}/mcp`);
  });
}

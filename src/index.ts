import * as http from "node:http";
import { env } from "./config";
import { assertAuthorized } from "./auth";
import { toolDefinitions, toolRequestSchema, type ToolName } from "./tools";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import { getRequestUrl, readJsonBody, sendJson } from "./lib/http";

export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    const url = getRequestUrl(req);

    if (!url) {
      return sendJson(res, 400, { error: "Missing URL" });
    }

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

    const body = toolRequestSchema.parse(await readJsonBody(req)) as {
      tool: ToolName;
      input?: unknown;
    };

    const tool = toolDefinitions[body.tool];

    if (!tool) {
      return sendJson(res, 400, { error: "Unknown or missing tool" });
    }

    const result = await tool.handler(body.input);

    return sendJson(res, 200, {
      tool: body.tool,
      result,
    });
  } catch (error) {
    return sendJson(res, getErrorStatus(error), {
      error: getErrorMessage(error),
    });
  }
}

const server = http.createServer(handleMcpRequest);

server.listen(env.PORT, () => {
  console.log(
    `github-mcp-bridge listening on http://localhost:${env.PORT}/mcp`,
  );
});

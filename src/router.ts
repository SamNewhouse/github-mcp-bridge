import * as http from "node:http";
import { assertAuthorized } from "./auth";
import { getErrorMessage, getErrorStatus } from "./lib/errors";
import { getRequestUrl, readJsonBody, sendJson } from "./lib/http";
import { executeTool, getToolList, toolRequestSchema } from "./tools";

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

    if (url.pathname !== "/") {
      return sendJson(res, 404, { error: "Not found" });
    }

    assertAuthorized(req);

    if (req.method === "GET") {
      return sendJson(res, 200, {
        name: "github-mcp-bridge",
        version: "0.1.0",
        tools: getToolList(),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const body = toolRequestSchema.parse(await readJsonBody(req));
    const result = await executeTool(body.tool, body.input);

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

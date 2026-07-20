// Vercel entrypoint for the MCP HTTP server.
//
// Keep all real application logic in `src/` so the service stays portable.
// This file exists only because Vercel discovers serverless functions from
// platform-specific entry files such as `api/*.ts`.
//
// Requests rewritten to `/mcp` or `/health` can be handled by the same core
// request handler in `src/app.ts`.

import { handleMcpRequest } from "../src/app";

export default function handler(req: any, res: any) {
  return handleMcpRequest(req, res);
}

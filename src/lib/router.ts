import * as http from "node:http";
import { getRequestUrl, sendJson } from "./http";
import { createRequestLogger } from "./logging";

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, log: ReturnType<typeof createRequestLogger>) => Promise<void>;

export type Router = {
  handle: RouteHandler;
  set: (method: string, path: string, handler: RouteHandler) => void;
};

export function createRouter(): Router {
  const routes = new Map<string, Record<string, RouteHandler>>();

  const set = (method: string, path: string, handler: RouteHandler) => {
    const existing = routes.get(path) || {};
    existing[method] = handler;
    routes.set(path, existing);
  };

  const handle: RouteHandler = async (req, res, log) => {
    const url = getRequestUrl(req);
    if (!url) {
      log.warn("request_rejected", { reason: "missing_url" });
      return sendJson(res, 400, { error: "Missing URL" });
    }

    const method = req.method ?? "GET";
    const routeMap = routes.get(url.pathname);
    const handler = routeMap?.[method];

    if (!handler) {
      log.warn("request_rejected", {
        path: url.pathname,
        method,
        reason: "not_found",
      });
      return sendJson(res, 404, { error: "Not found" });
    }

    return handler(req, res, log);
  };

  return { handle, set };
}

import * as http from "node:http";
import { AppError } from "./errors";

const MAX_BODY_SIZE_BYTES = 1024 * 1024;

export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let settled = false;

  const safeResolve = (value: unknown) => {
    if (settled) {
      return;
    }
    settled = true;
    resolve(value);
  };

  const safeReject = (error: unknown) => {
    if (settled) {
      return;
    }
    settled = true;
    reject(error);
  };

  req.on("data", (chunk: Buffer) => {
    if (settled) {
      return;
    }

    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_SIZE_BYTES) {
      safeReject(new AppError("Request body too large", 413));
      req.destroy();
      return;
    }

    chunks.push(chunk);
  });

  req.on("end", () => {
    if (settled) {
      return;
    }

    try {
      const raw = Buffer.concat(chunks).toString("utf8").trim();

      if (!raw) {
        safeResolve({});
        return;
      }

      safeResolve(JSON.parse(raw) as unknown);
    } catch {
      safeReject(new AppError("Invalid JSON body", 400));
    }
  });

  req.on("error", safeReject);

  return promise;
}

export function getRequestUrl(req: http.IncomingMessage): URL | null {
  if (!req.url) {
    return null;
  }

  return new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
}

export type JsonRpcId = string | number | null | undefined;

export function sendJsonRpcResult(
  res: http.ServerResponse,
  id: JsonRpcId,
  result: unknown,
): void {
  sendJson(res, 200, {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  });
}

export function sendJsonRpcResultWithSession(
  res: http.ServerResponse,
  id: JsonRpcId,
  result: unknown,
  sessionId: string,
): void {
  res.setHeader("mcp-session-id", sessionId);
  sendJsonRpcResult(res, id, result);
}

export function sendJsonRpcError(
  res: http.ServerResponse,
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
  httpStatus = 200,
): void {
  sendJson(res, httpStatus, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

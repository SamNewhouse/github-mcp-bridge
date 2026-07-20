import * as crypto from "node:crypto";
import * as http from "node:http";

export function getRequestId(req: http.IncomingMessage): string {
  const headerValue = req.headers["x-request-id"];

  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue;
  }

  if (Array.isArray(headerValue) && headerValue[0]?.trim()) {
    return headerValue[0];
  }

  return crypto.randomUUID();
}

export function getDurationMs(startedAt: number): number {
  return Date.now() - startedAt;
}

export function sanitizeHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, unknown> {
  return {
    authorization: headers.authorization ? "[present]" : "[missing]",
    "x-api-key": headers["x-api-key"] ? "[present]" : "[missing]",
    accept: headers.accept ?? null,
    contentType: headers["content-type"] ?? null,
    userAgent: headers["user-agent"] ?? null,
    host: headers.host ?? null,
    origin: headers.origin ?? null,
  };
}

type LogLevel = "info" | "warn" | "error";

function writeLog(
  level: LogLevel,
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = JSON.stringify({
    level,
    event,
    ...data,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}

export function logInfo(event: string, data: Record<string, unknown>): void {
  writeLog("info", event, data);
}

export function logWarn(event: string, data: Record<string, unknown>): void {
  writeLog("warn", event, data);
}

export function logError(event: string, data: Record<string, unknown>): void {
  writeLog("error", event, data);
}

export function createRequestLogger(req: http.IncomingMessage) {
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  function withContext(
    data: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      requestId,
      durationMs: getDurationMs(startedAt),
      ...data,
    };
  }

  return {
    requestId,
    startedAt,
    info(event: string, data: Record<string, unknown> = {}): void {
      writeLog("info", event, withContext(data));
    },
    warn(event: string, data: Record<string, unknown> = {}): void {
      writeLog("warn", event, withContext(data));
    },
    error(event: string, data: Record<string, unknown> = {}): void {
      writeLog("error", event, withContext(data));
    },
  };
}

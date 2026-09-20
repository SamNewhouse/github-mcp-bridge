import * as crypto from "node:crypto";
import type * as http from "node:http";

export const OPERATION_CACHE_TTL_MS = 5 * 60 * 1000;

export type RequestContext = {
  requestId: string;
  principalHash: string;
};

function getRequestId(headers: http.IncomingHttpHeaders): string | null {
  const header = headers["x-request-id"];
  const raw = Array.isArray(header) ? header[0] : header;
  const requestId = raw?.trim();

  if (!requestId || requestId.length > 200) {
    return null;
  }

  return requestId;
}

export function createRequestContext(headers: http.IncomingHttpHeaders, principal: string): RequestContext | null {
  const requestId = getRequestId(headers);

  if (!requestId) {
    return null;
  }

  return {
    requestId,
    principalHash: crypto.createHash("sha256").update(principal).digest("hex").slice(0, 24),
  };
}

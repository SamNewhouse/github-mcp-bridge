import * as crypto from "node:crypto";
import * as http from "node:http";
import { getConnectorSecrets } from "./config";
import { AppError } from "./lib/errors";
import type { createRequestLogger } from "./lib/logging";

type RequestLogger = ReturnType<typeof createRequestLogger>;

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function getApiKeyHeader(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) {
    const first = header[0]?.trim();
    return first ? first : null;
  }

  if (typeof header === "string") {
    const trimmed = header.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

/**
 * Constant-time string equality check to prevent timing side-channel attacks.
 * Returns false immediately if lengths differ (length is not secret), then
 * compares bytes in constant time using crypto.timingSafeEqual.
 */
function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function assertAuthorized(
  req: http.IncomingMessage,
  log?: RequestLogger,
): void {
  const authHeader = req.headers.authorization;
  const bearerToken = getBearerToken(authHeader);
  const apiKey = getApiKeyHeader(req.headers["x-api-key"]);
  const providedSecret = bearerToken ?? apiKey;

  if (!providedSecret) {
    log?.warn("authorization_missing", {
      method: req.method ?? null,
      url: req.url ?? null,
      authHeaderPresent: Boolean(authHeader),
      apiKeyHeaderPresent: Boolean(req.headers["x-api-key"]),
    });

    throw new AppError("Unauthorized", 401);
  }

  // Support rotation: CONNECTOR_SECRET may be a comma-separated list of valid
  // secrets (e.g. "newSecret,oldSecret"). A request is authorized if it matches
  // any of them. Remove the old secret once all clients have rotated.
  const validSecrets = getConnectorSecrets();
  const isAuthorized = validSecrets.some((expected) =>
    secretsEqual(providedSecret, expected),
  );

  if (!isAuthorized) {
    log?.warn("authorization_invalid", {
      method: req.method ?? null,
      url: req.url ?? null,
      authMethod: bearerToken ? "bearer" : "x-api-key",
    });

    throw new AppError("Unauthorized", 401);
  }
}

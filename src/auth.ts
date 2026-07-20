import * as http from "node:http";
import { getConnectorSecret } from "./config";
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

export function assertAuthorized(
  req: http.IncomingMessage,
  log?: RequestLogger,
): void {
  const authHeader = req.headers.authorization;
  const bearerToken = getBearerToken(authHeader);
  const apiKey = getApiKeyHeader(req.headers["x-api-key"]);
  const providedSecret = bearerToken ?? apiKey;
  const expectedSecret = getConnectorSecret();

  if (!providedSecret) {
    log?.warn("authorization_missing", {
      method: req.method ?? null,
      url: req.url ?? null,
      authHeaderPresent: Boolean(authHeader),
      apiKeyHeaderPresent: Boolean(req.headers["x-api-key"]),
    });

    throw new AppError("Unauthorized", 401);
  }

  if (providedSecret !== expectedSecret) {
    log?.warn("authorization_invalid", {
      method: req.method ?? null,
      url: req.url ?? null,
      authMethod: bearerToken ? "bearer" : "x-api-key",
    });

    throw new AppError("Unauthorized", 401);
  }
}

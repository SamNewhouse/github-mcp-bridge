import * as http from "node:http";
import { getConnectorSecret } from "./config";
import { AppError } from "./lib/errors";
import { createRequestLogger } from "./lib/logging";

export function assertAuthorized(req: http.IncomingMessage): void {
  const log = createRequestLogger(req);

  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  const headerSecret = req.headers["x-api-key"];
  const apiKey = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;

  const provided = bearer ?? apiKey;

  if (!provided) {
    log.warn("authorization_missing", {
      method: req.method ?? null,
      url: req.url ?? null,
      authHeaderPresent: Boolean(authHeader),
      apiKeyHeaderPresent: Boolean(headerSecret),
    });

    throw new AppError("Unauthorized", 401);
  }

  if (provided !== getConnectorSecret()) {
    log.warn("authorization_invalid", {
      method: req.method ?? null,
      url: req.url ?? null,
      authMethod: bearer ? "bearer" : "x-api-key",
    });

    throw new AppError("Unauthorized", 401);
  }
}

import * as http from "node:http";
import { getConnectorSecret } from "./config";
import { AppError } from "./lib/errors";

export function assertAuthorized(req: http.IncomingMessage): void {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  const headerSecret = req.headers["x-api-key"];
  const provided =
    bearer ?? (Array.isArray(headerSecret) ? headerSecret[0] : headerSecret);

  if (!provided || provided !== getConnectorSecret()) {
    throw new AppError("Unauthorized", 401);
  }
}

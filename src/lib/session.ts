import * as crypto from "node:crypto";
import type * as http from "node:http";
import { Redis } from "@upstash/redis";
import { getMcpSessionIdleTtlMs, getMcpSessionMaxTtlMs } from "../config";
import { logInfo } from "./logging";

type SessionRecord = {
  principal: string;
  createdAt: number;
};

let redisClient: Redis | null = null;

function redis(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error("Redis REST URL/token env vars are not set");
    }

    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

const key = (sessionId: string) => `mcp:session:${sessionId}`;

/** Creates a session that expires after the idle TTL (capped by max TTL). */
export async function createSession(principal: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const record: SessionRecord = { principal, createdAt: Date.now() };

  await redis().set(key(sessionId), record, {
    px: Math.min(getMcpSessionIdleTtlMs(), getMcpSessionMaxTtlMs()),
  });

  return sessionId;
}

export const getOrCreateSessionForPrincipal = createSession;

/**
 * Validates a session for a principal and, if valid, slides the idle expiry
 * forward without ever exceeding the maximum lifetime.
 */
export async function touchSessionForPrincipal(
  sessionId: string,
  principal: string,
): Promise<boolean> {
  const record = await redis().get<SessionRecord>(key(sessionId));

  if (!record || record.principal !== principal) {
    return false;
  }

  const remainingMax = record.createdAt + getMcpSessionMaxTtlMs() - Date.now();

  if (remainingMax <= 0) {
    await redis().del(key(sessionId));
    logInfo("mcp_session_expired", { sessionId, reason: "maximum" });
    return false;
  }

  await redis().pexpire(
    key(sessionId),
    Math.min(getMcpSessionIdleTtlMs(), remainingMax),
  );

  return true;
}

export async function deleteSessionForPrincipal(
  sessionId: string,
  principal: string,
): Promise<boolean> {
  const record = await redis().get<SessionRecord>(key(sessionId));

  if (!record || record.principal !== principal) {
    return false;
  }

  return (await redis().del(key(sessionId))) > 0;
}

export function getSessionIdFromHeaders(
  headers: http.IncomingHttpHeaders,
): string | null {
  const value = headers["mcp-session-id"];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

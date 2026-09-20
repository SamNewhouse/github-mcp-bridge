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
    const url = process.env.UPSTASH_REDIS_KV_REST_API_URL ?? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      // No Redis credentials - use in-memory
      return null as unknown as Redis;
    }

    // Only initialize Redis client in production (Vercel)
    // Check for Vercel-specific environment
    const isVercel = process.env.VERCEL === "1";

    if (!isVercel) {
      // Don't use Redis in local dev even if credentials are present
      return null as unknown as Redis;
    }

    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

const key = (sessionId: string) => `mcp:session:${sessionId}`;

// In-memory store for local/CI
const memorySessions = new Map<string, { record: SessionRecord; expiresAt: number; maxLifetimeExpiresAt: number }>();

/** Creates a session that expires after the idle TTL (capped by max TTL). */
export async function createSession(principal: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const record: SessionRecord = { principal, createdAt: Date.now() };

  const client = redis();

  if (!client) {
    // In-memory path (local/CI)
    const idleExpiresAt = Date.now() + getMcpSessionIdleTtlMs();
    const maxLifetimeExpiresAt = Date.now() + getMcpSessionMaxTtlMs();
    memorySessions.set(sessionId, {
      record,
      expiresAt: idleExpiresAt,
      maxLifetimeExpiresAt,
    });
    return sessionId;
  }

  // Production Redis path (Vercel only)
  await client.set(key(sessionId), record, {
    px: Math.min(getMcpSessionIdleTtlMs(), getMcpSessionMaxTtlMs()),
  });

  return sessionId;
}

export const getOrCreateSessionForPrincipal = createSession;

/**
 * Validates a session for a principal and, if valid, slides the idle expiry
 * forward without ever exceeding the maximum lifetime.
 */
export async function touchSessionForPrincipal(sessionId: string, principal: string): Promise<boolean> {
  const client = redis();

  if (!client) {
    // In-memory path (local/CI)
    const entry = memorySessions.get(sessionId);
    if (!entry || entry.record.principal !== principal) {
      return false;
    }

    // Check if max lifetime has expired
    if (Date.now() > entry.maxLifetimeExpiresAt) {
      memorySessions.delete(sessionId);
      logInfo("mcp_session_expired", { sessionId, reason: "maximum" });
      return false;
    }

    // Check if idle timeout has expired
    if (Date.now() > entry.expiresAt) {
      memorySessions.delete(sessionId);
      logInfo("mcp_session_expired", { sessionId, reason: "idle" });
      return false;
    }

    // Slide idle window (but never past max lifetime)
    const newIdleExpiresAt = Date.now() + getMcpSessionIdleTtlMs();
    entry.expiresAt = Math.min(newIdleExpiresAt, entry.maxLifetimeExpiresAt);
    return true;
  }

  // Production Redis path (Vercel only)
  const record = await client.get<SessionRecord>(key(sessionId));

  if (!record || record.principal !== principal) {
    return false;
  }

  const remainingMax = record.createdAt + getMcpSessionMaxTtlMs() - Date.now();

  if (remainingMax <= 0) {
    await client.del(key(sessionId));
    logInfo("mcp_session_expired", { sessionId, reason: "maximum" });
    return false;
  }

  await client.pexpire(key(sessionId), Math.min(getMcpSessionIdleTtlMs(), remainingMax));

  return true;
}

export async function deleteSessionForPrincipal(sessionId: string, principal: string): Promise<boolean> {
  const client = redis();

  if (!client) {
    // In-memory path (local/CI)
    const entry = memorySessions.get(sessionId);
    if (!entry || entry.record.principal !== principal) {
      return false;
    }
    memorySessions.delete(sessionId);
    return true;
  }

  // Production Redis path (Vercel only)
  const record = await client.get<SessionRecord>(key(sessionId));

  if (!record || record.principal !== principal) {
    return false;
  }

  return (await client.del(key(sessionId))) > 0;
}

export function getSessionIdFromHeaders(headers: http.IncomingHttpHeaders): string | null {
  const value = headers["mcp-session-id"];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

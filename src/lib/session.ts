import * as crypto from "node:crypto";
import type * as http from "node:http";

const SESSION_TTL_MS = 30 * 60 * 1000;

type SessionRecord = {
  expiresAt: number;
};

const sessions = new Map<string, SessionRecord>();

function now(): number {
  return Date.now();
}

function pruneExpiredSessions(): void {
  const timestamp = now();

  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= timestamp) {
      sessions.delete(sessionId);
    }
  }
}

export function createSession(): string {
  pruneExpiredSessions();
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { expiresAt: now() + SESSION_TTL_MS });
  return sessionId;
}

export function validateSession(sessionId: string): boolean {
  pruneExpiredSessions();
  const session = sessions.get(sessionId);
  return Boolean(session && session.expiresAt > now());
}

export function touchSession(sessionId: string): boolean {
  if (!validateSession(sessionId)) {
    return false;
  }

  sessions.set(sessionId, { expiresAt: now() + SESSION_TTL_MS });
  return true;
}

export function getSessionIdFromHeaders(
  headers: http.IncomingHttpHeaders,
): string | null {
  const value = headers["mcp-session-id"];

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : null;
  }

  return null;
}

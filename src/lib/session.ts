import * as crypto from "node:crypto";
import type * as http from "node:http";
import { getMcpSessionMaxTtlMs } from "../config";

type SessionRecord = {
  principal: string;
  createdAt: number;
  lastSeenAt: number;
};

const sessions = new Map<string, SessionRecord>();
const principalToSessionId = new Map<string, string>();

function now(): number {
  return Date.now();
}

function isExpired(session: SessionRecord, timestamp: number): boolean {
  const maxAgeMs = getMcpSessionMaxTtlMs();
  return session.createdAt + maxAgeMs <= timestamp;
}

function deleteSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  sessions.delete(sessionId);
  const current = principalToSessionId.get(session.principal);
  if (current === sessionId) {
    principalToSessionId.delete(session.principal);
  }
}

function pruneExpiredSessions(): void {
  const timestamp = now();

  for (const [sessionId, session] of sessions.entries()) {
    if (isExpired(session, timestamp)) {
      deleteSession(sessionId);
    }
  }
}

export function createSession(principal: string): string {
  pruneExpiredSessions();

  const existingSessionId = principalToSessionId.get(principal);
  if (existingSessionId) {
    const existing = sessions.get(existingSessionId);
    if (existing && !isExpired(existing, now())) {
      touchSession(existingSessionId);
      return existingSessionId;
    }

    deleteSession(existingSessionId);
  }

  const timestamp = now();
  const sessionId = crypto.randomUUID();

  sessions.set(sessionId, {
    principal,
    createdAt: timestamp,
    lastSeenAt: timestamp,
  });
  principalToSessionId.set(principal, sessionId);

  return sessionId;
}

export function getOrCreateSessionForPrincipal(principal: string): string {
  pruneExpiredSessions();

  const existingSessionId = principalToSessionId.get(principal);
  if (!existingSessionId) {
    return createSession(principal);
  }

  const existing = sessions.get(existingSessionId);
  if (!existing || isExpired(existing, now())) {
    deleteSession(existingSessionId);
    return createSession(principal);
  }

  touchSession(existingSessionId);
  return existingSessionId;
}

export function validateSession(
  sessionId: string,
  principal?: string,
): boolean {
  pruneExpiredSessions();

  const session = sessions.get(sessionId);
  if (!session || isExpired(session, now())) {
    if (session) {
      deleteSession(sessionId);
    }
    return false;
  }

  if (principal && session.principal !== principal) {
    return false;
  }

  return true;
}

export function touchSession(sessionId: string): boolean {
  pruneExpiredSessions();

  const session = sessions.get(sessionId);
  if (!session || isExpired(session, now())) {
    if (session) {
      deleteSession(sessionId);
    }
    return false;
  }

  sessions.set(sessionId, {
    ...session,
    lastSeenAt: now(),
  });

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

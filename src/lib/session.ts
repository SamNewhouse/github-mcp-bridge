import * as crypto from "node:crypto";
import type * as http from "node:http";
import {
  getMcpSessionIdleTtlMs,
  getMcpSessionMaxTtlMs,
} from "../config";
import { logInfo } from "./logging";

type SessionRecord = {
  principal: string;
  createdAt: number;
  lastSeenAt: number;
  idleTimer: NodeJS.Timeout;
  maxLifetimeTimer: NodeJS.Timeout;
};

const sessions = new Map<string, SessionRecord>();
const principalToSessionId = new Map<string, string>();

/**
 * Returns the current timestamp in milliseconds.
 *
 * @returns The current Unix timestamp in milliseconds.
 */
function now(): number {
  return Date.now();
}

/**
 * Determines whether a session has exceeded either its idle timeout or
 * maximum lifetime.
 *
 * @param session - The session to inspect.
 * @param timestamp - The timestamp against which expiration is checked.
 * @returns True when the session has expired.
 */
function isExpired(session: SessionRecord, timestamp: number): boolean {
  const idleExpired =
    session.lastSeenAt + getMcpSessionIdleTtlMs() <= timestamp;

  const maximumLifetimeExpired =
    session.createdAt + getMcpSessionMaxTtlMs() <= timestamp;

  return idleExpired || maximumLifetimeExpired;
}

/**
 * Clears the timers associated with a session.
 *
 * @param session - The session whose timers should be cleared.
 */
function clearSessionTimers(session: SessionRecord): void {
  clearTimeout(session.idleTimer);
  clearTimeout(session.maxLifetimeTimer);
}

/**
 * Removes a session from both in-memory indexes.
 *
 * @param sessionId - The session ID to remove.
 * @returns True when a session was removed.
 */
function deleteSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);

  if (!session) {
    return false;
  }

  clearSessionTimers(session);
  sessions.delete(sessionId);

  const current = principalToSessionId.get(session.principal);

  if (current === sessionId) {
    principalToSessionId.delete(session.principal);
  }

  return true;
}

/**
 * Expires and removes a session, logging the reason.
 *
 * @param sessionId - The session ID to expire.
 * @param reason - Whether the idle or maximum lifetime limit was reached.
 */
function expireSession(
  sessionId: string,
  reason: "idle" | "maximum",
): void {
  const session = sessions.get(sessionId);

  if (!session) {
    return;
  }

  const deleted = deleteSession(sessionId);

  if (deleted) {
    logInfo("mcp_session_expired", {
      sessionId,
      reason,
    });
  }
}

/**
 * Schedules idle and maximum-lifetime timers for a session.
 *
 * The idle timer is replaced whenever the session is touched. The maximum
 * lifetime timer is not extended by activity.
 *
 * @param sessionId - The session ID whose timers should be scheduled.
 * @param session - The session record being scheduled.
 */
function scheduleSessionTimers(
  sessionId: string,
  session: SessionRecord,
): void {
  clearSessionTimers(session);

  const idleDelay = Math.max(
    1,
    session.lastSeenAt + getMcpSessionIdleTtlMs() - now(),
  );

  const maximumLifetimeDelay = Math.max(
    1,
    session.createdAt + getMcpSessionMaxTtlMs() - now(),
  );

  session.idleTimer = setTimeout(() => {
    const current = sessions.get(sessionId);

    if (!current) {
      return;
    }

    if (current.lastSeenAt !== session.lastSeenAt) {
      scheduleSessionTimers(sessionId, current);
      return;
    }

    expireSession(sessionId, "idle");
  }, idleDelay);

  session.maxLifetimeTimer = setTimeout(() => {
    expireSession(sessionId, "maximum");
  }, maximumLifetimeDelay);

  session.idleTimer.unref?.();
  session.maxLifetimeTimer.unref?.();
}

/**
 * Removes any sessions that have expired.
 *
 * This is a defensive cleanup pass used before session operations. Timers
 * normally remove sessions immediately when their expiry time is reached.
 */
function pruneExpiredSessions(): void {
  const timestamp = now();

  for (const [sessionId, session] of sessions.entries()) {
    if (isExpired(session, timestamp)) {
      const reason =
        session.createdAt + getMcpSessionMaxTtlMs() <= timestamp
          ? "maximum"
          : "idle";

      expireSession(sessionId, reason);
    }
  }
}

/**
 * Creates a session for a principal.
 *
 * If the principal already has a valid session, that session is reused and
 * refreshed instead of creating a second session.
 *
 * @param principal - The authenticated caller identity.
 * @returns The new or reused session ID.
 */
export function createSession(principal: string): string {
  pruneExpiredSessions();

  const existingSessionId = principalToSessionId.get(principal);

  if (existingSessionId) {
    const existing = sessions.get(existingSessionId);

    if (existing && !isExpired(existing, now())) {
      touchSession(existingSessionId);
      return existingSessionId;
    }

    if (existing) {
      deleteSession(existingSessionId);
    }
  }

  const timestamp = now();
  const sessionId = crypto.randomUUID();

  const session: SessionRecord = {
    principal,
    createdAt: timestamp,
    lastSeenAt: timestamp,
    idleTimer: undefined as unknown as NodeJS.Timeout,
    maxLifetimeTimer: undefined as unknown as NodeJS.Timeout,
  };

  sessions.set(sessionId, session);
  principalToSessionId.set(principal, sessionId);
  scheduleSessionTimers(sessionId, session);

  return sessionId;
}

/**
 * Returns the active session for a principal or creates one.
 *
 * @param principal - The authenticated caller identity.
 * @returns The active or newly created session ID.
 */
export function getOrCreateSessionForPrincipal(
  principal: string,
): string {
  pruneExpiredSessions();

  const existingSessionId = principalToSessionId.get(principal);

  if (!existingSessionId) {
    return createSession(principal);
  }

  const existing = sessions.get(existingSessionId);

  if (!existing || isExpired(existing, now())) {
    if (existing) {
      deleteSession(existingSessionId);
    }

    return createSession(principal);
  }

  touchSession(existingSessionId);
  return existingSessionId;
}

/**
 * Validates that a session exists, has not expired, and optionally belongs
 * to the supplied principal.
 *
 * @param sessionId - The session ID to validate.
 * @param principal - Optional authenticated caller identity.
 * @returns True when the session is valid.
 */
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

/**
 * Marks a session as active and resets its idle-expiry timer.
 *
 * The maximum lifetime timer is also rescheduled from the original
 * creation timestamp, so activity cannot extend the one-hour maximum.
 *
 * @param sessionId - The session ID to refresh.
 * @returns True when the session was refreshed.
 */
export function touchSession(sessionId: string): boolean {
  pruneExpiredSessions();

  const session = sessions.get(sessionId);

  if (!session || isExpired(session, now())) {
    if (session) {
      deleteSession(sessionId);
    }

    return false;
  }

  session.lastSeenAt = now();
  scheduleSessionTimers(sessionId, session);

  return true;
}

/**
 * Deletes a session when requested by its owning principal.
 *
 * @param sessionId - The session ID to delete.
 * @param principal - The authenticated caller identity.
 * @returns True when the session was deleted.
 */
export function deleteSessionForPrincipal(
  sessionId: string,
  principal: string,
): boolean {
  pruneExpiredSessions();

  const session = sessions.get(sessionId);

  if (!session || session.principal !== principal) {
    return false;
  }

  return deleteSession(sessionId);
}

/**
 * Extracts an MCP session ID from request headers.
 *
 * @param headers - Incoming HTTP request headers.
 * @returns The trimmed session ID, or null when no session ID is present.
 */
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

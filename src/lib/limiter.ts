/**
 * In-memory rate limiter for authentication failures.
 *
 * Tracks failed auth attempts per IP. After MAX_FAILURES within WINDOW_MS the
 * client is blocked for BLOCK_DURATION_MS. Entries are expired lazily on each
 * check to keep memory bounded without a background timer.
 *
 * Note: this state is per-process. On serverless runtimes (Vercel) each cold
 * start gets a fresh counter. For persistent enforcement across instances,
 * replace the Map with a shared store (e.g. Vercel KV / Redis). For a
 * self-hosted single-process deployment this is fully effective.
 */

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

type IpRecord = {
  failures: number;
  windowStart: number;
  blockedUntil: number | null;
};

const records = new Map<string, IpRecord>();

function now(): number {
  return Date.now();
}

function getRecord(ip: string): IpRecord {
  let record = records.get(ip);

  if (!record) {
    record = { failures: 0, windowStart: now(), blockedUntil: null };
    records.set(ip, record);
  }

  // Reset window if it has expired
  if (now() - record.windowStart > WINDOW_MS) {
    record.failures = 0;
    record.windowStart = now();
    record.blockedUntil = null;
  }

  return record;
}

/**
 * Returns true if the IP is currently rate-limited (too many auth failures).
 * Call this BEFORE processing auth — if blocked, reject immediately.
 */
export function isRateLimited(ip: string): boolean {
  const record = getRecord(ip);

  if (record.blockedUntil !== null && now() < record.blockedUntil) {
    return true;
  }

  if (record.blockedUntil !== null && now() >= record.blockedUntil) {
    // Block has expired — reset
    record.failures = 0;
    record.windowStart = now();
    record.blockedUntil = null;
  }

  return false;
}

/**
 * Records a failed auth attempt for the IP.
 * Call this AFTER confirming auth has failed.
 */
export function recordAuthFailure(ip: string): void {
  const record = getRecord(ip);
  record.failures += 1;

  if (record.failures >= MAX_FAILURES) {
    record.blockedUntil = now() + BLOCK_DURATION_MS;
  }
}

/**
 * Resets the failure counter for an IP on successful auth.
 * Prevents legitimate clients from accumulating stale failures.
 */
export function recordAuthSuccess(ip: string): void {
  records.delete(ip);
}

/**
 * Returns the IP address from an incoming request.
 * Prefers X-Forwarded-For (set by Vercel/proxies) over socket.remoteAddress.
 */
export function getClientIp(
  req: import("node:http").IncomingMessage,
): string {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    // X-Forwarded-For may be a comma-separated list; first entry is the client
    return forwarded.split(",")[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded[0]?.trim()) {
    return forwarded[0].trim();
  }

  return req.socket?.remoteAddress ?? "unknown";
}

type CacheEntry<T> = {
  value: T;
  expiresAt: number; // ms timestamp
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 90_000; // 90 seconds

function cacheKey(method: string, path: string, body?: unknown): string {
  return JSON.stringify([method, path, body ?? null]);
}

export function getFromCache<T>(
  method: string,
  path: string,
  body?: unknown,
): T | null {
  const key = cacheKey(method, path, body);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setInCache<T>(
  method: string,
  path: string,
  body: unknown | undefined,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS,
) {
  const key = cacheKey(method, path, body);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

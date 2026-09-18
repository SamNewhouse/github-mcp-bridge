type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  etag?: string;
  size: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 90_000;
const MAX_CACHE_ENTRIES = 500;
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024;

interface CacheConfig {
  patterns: RegExp[];
  ttlMs: number;
  description: string;
}

const CACHE_CONFIGS: CacheConfig[] = [
  {
    patterns: [/^\/users\/[^/]+$/, /^\/orgs\/[^/]+$/, /^\/rate_limit$/],
    ttlMs: 300_000,
    description: "Static profiles",
  },
  {
    patterns: [
      /^\/repos\/[^/]+\/[^/]+$/,
      /^\/repos\/[^/]+\/[^/]+\/(branches|languages|topics)$/,
    ],
    ttlMs: 120_000,
    description: "Repository metadata",
  },
  {
    patterns: [
      /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/,
      /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+\/files$/,
      /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+\/comments$/,
      /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+\/reviews$/,
    ],
    ttlMs: 60_000,
    description: "Pull request details",
  },
  {
    patterns: [
      /^\/repos\/[^/]+\/[^/]+\/pulls$/,
      /^\/repos\/[^/]+\/[^/]+\/issues$/,
      /^\/repos\/[^/]+\/[^/]+\/commits$/,
      /^\/repos\/[^/]+\/[^/]+\/branches$/,
    ],
    ttlMs: 30_000,
    description: "Frequently changing lists",
  },
];

/**
 * Estimates the memory size of a cache value in bytes.
 *
 * JSON serialization is used as a lightweight approximation. The result
 * assumes two bytes per serialized character.
 *
 * @param value - The value whose approximate size should be calculated.
 * @returns The estimated size in bytes.
 */
function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 1024;
  }
}

/**
 * Creates a stable key for a cache entry.
 *
 * The representation is included so that requests for the same endpoint
 * can cache different response formats, such as JSON and unified diff text.
 *
 * @param method - The HTTP method.
 * @param path - The GitHub API path.
 * @param body - The request body, if present.
 * @param representation - The response representation.
 * @returns The serialized cache key.
 */
function cacheKey(
  method: string,
  path: string,
  body?: unknown,
  representation = "default",
): string {
  return JSON.stringify([method, path, body ?? null, representation]);
}

/**
 * Removes the oldest cache entry.
 *
 * Map insertion order is used as a simple FIFO eviction strategy.
 */
function evictOldest(): void {
  if (cache.size === 0) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

/**
 * Calculates the estimated total size of all cache entries.
 *
 * @returns The estimated cache size in bytes.
 */
function getTotalCacheSize(): number {
  let totalSize = 0;

  for (const entry of cache.values()) {
    totalSize += entry.size;
  }

  return totalSize;
}

/**
 * Evicts the oldest entries until both cache limits are satisfied.
 */
function evictUntilUnderLimit(): void {
  while (
    cache.size > MAX_CACHE_ENTRIES ||
    getTotalCacheSize() > MAX_CACHE_SIZE_BYTES
  ) {
    if (cache.size === 0) {
      break;
    }

    evictOldest();
  }
}

/**
 * Gets the cache TTL configured for a GitHub API path.
 *
 * The query string and one trailing slash are ignored when matching
 * configured endpoint patterns.
 *
 * @param path - The GitHub API path.
 * @returns The TTL in milliseconds.
 */
export function getCacheTTL(path: string): number {
  const normalizedPath = path.split("?")[0].replace(/\/$/, "");

  for (const config of CACHE_CONFIGS) {
    if (config.patterns.some((pattern) => pattern.test(normalizedPath))) {
      return config.ttlMs;
    }
  }

  return DEFAULT_TTL_MS;
}

/**
 * Retrieves a non-expired value from the cache.
 *
 * @typeParam T - The expected cached value type.
 * @param method - The HTTP method.
 * @param path - The GitHub API path.
 * @param body - The request body, if present.
 * @param representation - The response representation.
 * @returns The cached value, or `null` when no valid entry exists.
 */
export function getFromCache<T>(
  method: string,
  path: string,
  body?: unknown,
  representation = "default",
): T | null {
  const key = cacheKey(method, path, body, representation);
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

/**
 * Stores a value in the cache.
 *
 * Existing entries with the same key are replaced and moved to the newest
 * position before eviction limits are applied.
 *
 * @typeParam T - The value type being cached.
 * @param method - The HTTP method.
 * @param path - The GitHub API path.
 * @param body - The request body, if present.
 * @param value - The value to cache.
 * @param options - Optional TTL, ETag, and response representation metadata.
 */
export function setInCache<T>(
  method: string,
  path: string,
  body: unknown | undefined,
  value: T,
  options?: {
    ttlMs?: number;
    etag?: string;
    representation?: string;
  },
): void {
  const ttlMs = options?.ttlMs ?? getCacheTTL(path);
  const etag = options?.etag;
  const representation = options?.representation ?? "default";
  const key = cacheKey(method, path, body, representation);
  const size = estimateSize(value);

  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    etag,
    size,
  });

  evictUntilUnderLimit();
}

/**
 * Invalidates cached entries associated with a path.
 *
 * Entries are removed when their path starts with `pathPattern` or belongs
 * to the same repository prefix as the mutated path.
 *
 * @param pathPattern - The path or path prefix that changed.
 */
export function invalidateCacheForPath(pathPattern: string): void {
  const keysToDelete: string[] = [];
  const pathPrefix = pathPattern.split("/").slice(0, 3).join("/");

  for (const key of cache.keys()) {
    try {
      const [, path] = JSON.parse(key) as [string, string, unknown, string?];

      const sameRepository =
        pathPrefix === path.split("/").slice(0, 3).join("/");

      if (path.startsWith(pathPattern) || sameRepository) {
        keysToDelete.push(key);
      }
    } catch {
      // Ignore malformed cache keys.
    }
  }

  for (const key of keysToDelete) {
    cache.delete(key);
  }
}

/**
 * Gets statistics for currently valid cache entries.
 *
 * Expired entries are removed before statistics are returned.
 *
 * @returns The estimated cache size, valid entry count, and cache keys.
 */
export function getCacheStats(): {
  size: number;
  entries: number;
  keys: string[];
} {
  const now = Date.now();
  const validKeys: string[] = [];

  for (const [key, entry] of cache.entries()) {
    if (now <= entry.expiresAt) {
      validKeys.push(key);
    } else {
      cache.delete(key);
    }
  }

  return {
    size: getTotalCacheSize(),
    entries: validKeys.length,
    keys: validKeys,
  };
}

/**
 * Removes every entry from the in-memory cache.
 */
export function clearCache(): void {
  cache.clear();
}

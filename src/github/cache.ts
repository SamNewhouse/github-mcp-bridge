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

function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 1024;
  }
}

function cacheKey(
  method: string,
  path: string,
  body?: unknown,
  representation = "default",
): string {
  return JSON.stringify([method, path, body ?? null, representation]);
}

function evictOldest(): void {
  if (cache.size === 0) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

function getTotalCacheSize(): number {
  let totalSize = 0;

  for (const entry of cache.values()) {
    totalSize += entry.size;
  }

  return totalSize;
}

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

export function getCacheTTL(path: string): number {
  const normalizedPath = path.split("?")[0].replace(/\/$/, "");

  for (const config of CACHE_CONFIGS) {
    if (config.patterns.some((pattern) => pattern.test(normalizedPath))) {
      return config.ttlMs;
    }
  }

  return DEFAULT_TTL_MS;
}

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

export function clearCache(): void {
  cache.clear();
}

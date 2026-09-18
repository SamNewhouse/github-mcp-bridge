type CacheEntry<T> = {
  value: T;
  expiresAt: number; // ms timestamp
  etag?: string;
  size: number; // estimated memory size in bytes
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 90_000; // 90 seconds
const MAX_CACHE_ENTRIES = 500;
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

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
    return JSON.stringify(value).length * 2; // Rough estimate: 2 bytes per char
  } catch {
    return 1024; // Default to 1KB if can't serialize
  }
}

function cacheKey(
  method: string,
  path: string,
  body?: unknown,
  representation?: string,
): string {
  return JSON.stringify([
    method,
    path,
    body ?? null,
    representation ?? "default",
  ]);
}

function evictOldest(): void {
  if (cache.size === 0) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    const entry = cache.get(oldestKey);
    if (entry) {
      cache.delete(oldestKey);
    }
  }
}

function evictUntilUnderLimit(): void {
  while (cache.size > 0) {
    let totalSize = 0;
    for (const entry of cache.values()) {
      totalSize += entry.size;
    }

    if (totalSize <= MAX_CACHE_SIZE_BYTES && cache.size <= MAX_CACHE_ENTRIES) {
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
  options?: {
    ttlMs?: number;
    etag?: string;
  },
): void {
  const ttlMs = options?.ttlMs ?? getCacheTTL(path);
  const etag = options?.etag;
  const key = cacheKey(method, path, body);
  const size = estimateSize(value);

  // Evict if at capacity
  if (cache.size >= MAX_CACHE_ENTRIES) {
    evictOldest();
  }

  // Check if adding this would exceed size limit
  let totalSize = 0;
  for (const entry of cache.values()) {
    totalSize += entry.size;
  }

  if (totalSize + size > MAX_CACHE_SIZE_BYTES) {
    evictUntilUnderLimit();
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    etag,
    size,
  });
}

export function invalidateCacheForPath(pathPattern: string): void {
  const keysToDelete: string[] = [];

  for (const key of cache.keys()) {
    try {
      const [method, path] = JSON.parse(key as string) as [string, string];
      if (
        path.startsWith(pathPattern) ||
        pathPattern.split("/").slice(0, 3).join("/") ===
          path.split("/").slice(0, 3).join("/")
      ) {
        keysToDelete.push(key);
      }
    } catch {
      // Skip malformed keys
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
    size: cache.size,
    entries: validKeys.length,
    keys: validKeys,
  };
}

export function clearCache(): void {
  cache.clear();
}

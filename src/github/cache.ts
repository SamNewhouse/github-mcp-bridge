import * as crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { OPERATION_CACHE_TTL_MS, type RequestContext } from "../lib/request-context";

type MemoryCacheEntry = {
  value: unknown;
  expiresAt: number;
  repositoryPrefix: string | null;
};

let redisClient: Redis | null | undefined;

const memoryCache = new Map<string, MemoryCacheEntry>();

function getRedis(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_KV_REST_API_URL ?? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;

  const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  redisClient = url && token && process.env.VERCEL === "1" ? new Redis({ url, token }) : null;

  return redisClient;
}

function getRepositoryPrefix(path: string): string | null {
  const segments = path.split("?")[0].split("/").filter(Boolean);

  if (segments[0] !== "repos" || !segments[1] || !segments[2]) {
    return null;
  }

  return `/repos/${segments[1]}/${segments[2]}`;
}

function getCacheKey(context: RequestContext, method: string, path: string, body: unknown, representation: string): string {
  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify([method.toUpperCase(), path, body ?? null, representation]))
    .digest("hex");

  return ["mcp", "operation", context.principalHash, context.requestId, "github", requestHash].join(":");
}

function getOperationIndexKey(context: RequestContext): string {
  return ["mcp", "operation", context.principalHash, context.requestId, "github-keys"].join(":");
}

function getMemoryOperationPrefix(context: RequestContext): string {
  return ["mcp", "operation", context.principalHash, context.requestId, "github"].join(":");
}

export async function getFromOperationCache<T>(
  context: RequestContext | null,
  method: string,
  path: string,
  body: unknown,
  representation: string,
): Promise<T | null> {
  if (!context) {
    return null;
  }

  const cacheKey = getCacheKey(context, method, path, body, representation);
  const redis = getRedis();

  if (redis) {
    return (await redis.get<T>(cacheKey)) ?? null;
  }

  const entry = memoryCache.get(cacheKey);

  if (!entry || Date.now() >= entry.expiresAt) {
    memoryCache.delete(cacheKey);
    return null;
  }

  return entry.value as T;
}

export async function setInOperationCache<T>(
  context: RequestContext | null,
  method: string,
  path: string,
  body: unknown,
  representation: string,
  value: T,
): Promise<void> {
  if (!context) {
    return;
  }

  const cacheKey = getCacheKey(context, method, path, body, representation);
  const repositoryPrefix = getRepositoryPrefix(path);
  const redis = getRedis();

  if (redis) {
    const indexKey = getOperationIndexKey(context);

    await redis.set(cacheKey, value, {
      px: OPERATION_CACHE_TTL_MS,
    });

    await redis.sadd(indexKey, cacheKey);
    await redis.pexpire(indexKey, OPERATION_CACHE_TTL_MS);
    return;
  }

  memoryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + OPERATION_CACHE_TTL_MS,
    repositoryPrefix,
  });
}

/**
 * Removes only cache entries for the repository mutated by a GitHub write.
 * The Redis set is an operation-local index: it avoids a production KEYS scan.
 */
export async function invalidateOperationCacheForPath(context: RequestContext | null, path: string): Promise<void> {
  if (!context) {
    return;
  }

  const repositoryPrefix = getRepositoryPrefix(path);

  if (!repositoryPrefix) {
    return;
  }

  const redis = getRedis();

  if (redis) {
    const indexKey = getOperationIndexKey(context);
    const keys = await redis.smembers<string[]>(indexKey);

    if (keys.length > 0) {
      await redis.del(...keys);
      await redis.del(indexKey);
    }

    return;
  }

  const operationPrefix = getMemoryOperationPrefix(context);

  for (const [cacheKey, entry] of memoryCache.entries()) {
    if (cacheKey.startsWith(operationPrefix) && entry.repositoryPrefix === repositoryPrefix) {
      memoryCache.delete(cacheKey);
    }
  }
}

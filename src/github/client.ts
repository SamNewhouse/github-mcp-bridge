import { getGithubPatForOwner } from "../config";
import { AppError } from "../lib/errors";
import { logError, logInfo, logWarn } from "../lib/logging";
import { getFromOperationCache, invalidateOperationCacheForPath, setInOperationCache } from "./cache";
import { getRequestContext } from "./request-context";
import { mapGithubStatus } from "./status";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024;

type GithubRequestOptions = RequestInit & {
  responseType?: "json" | "text";
  owner?: string;
};

function getCacheRepresentation(headers: Headers, responseType: "json" | "text"): string {
  return `${responseType}:${headers.get("Accept") ?? "default"}`;
}

export async function githubRequest<T>(path: string, init: GithubRequestOptions = {}): Promise<T> {
  const startedAt = Date.now();
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  const responseType = init.responseType ?? "json";
  const owner = init.owner ?? "";
  const requestContext = getRequestContext();
  const { pat, key: patKey } = getGithubPatForOwner(owner);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/vnd.github+json");
  }

  const representation = getCacheRepresentation(headers, responseType);
  const bodyForCache = init.body ? JSON.parse(init.body as string) : undefined;

  if (method === "GET") {
    const cached = await getFromOperationCache<T>(requestContext, method, path, bodyForCache, representation);

    if (cached !== null) {
      clearTimeout(timeoutId);

      logInfo("github_operation_cache_hit", {
        requestId: requestContext?.requestId ?? null,
        method,
        path,
        representation,
        durationMs: Date.now() - startedAt,
      });

      return cached;
    }

    logInfo("github_operation_cache_miss", {
      requestId: requestContext?.requestId ?? null,
      method,
      path,
      representation,
    });
  }

  headers.set("Authorization", `Bearer ${pat}`);
  headers.set("User-Agent", "github-mcp-bridge");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startedAt;
    const remaining = response.headers.get("x-ratelimit-remaining");
    const resetEpoch = response.headers.get("x-ratelimit-reset");

    if (remaining !== null && Number(remaining) < 100) {
      logWarn("github_rate_limit_low", {
        method,
        path,
        remaining: Number(remaining),
        resetAt: resetEpoch ? new Date(Number(resetEpoch) * 1000).toISOString() : null,
      });
    }

    if (!response.ok) {
      const text = await response.text();

      logError("github_request_failed", {
        method,
        path,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        patKey,
        responseBody: text || null,
      });

      throw mapGithubStatus(response.status, text, patKey);
    }

    const contentLength = response.headers.get("content-length");

    if (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE_BYTES) {
      throw new AppError("GitHub response too large", 413);
    }

    const result = responseType === "text" ? ((await response.text()) as T) : ((await response.json()) as T);

    if (method === "GET") {
      await setInOperationCache(requestContext, method, path, bodyForCache, representation, result);

      logInfo("github_operation_cache_set", {
        requestId: requestContext?.requestId ?? null,
        method,
        path,
        representation,
      });
    }

    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      await invalidateOperationCacheForPath(requestContext, path);

      logInfo("github_operation_cache_invalidated", {
        requestId: requestContext?.requestId ?? null,
        method,
        path,
      });
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startedAt;

    if (error instanceof Error && error.name === "AbortError") {
      logError("github_request_timeout", {
        method,
        path,
        durationMs,
      });

      throw new AppError(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`, 504);
    }

    if (error instanceof AppError) {
      throw error;
    }

    logError("github_request_exception", {
      method,
      path,
      durationMs,
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

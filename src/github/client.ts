import { getGithubPatForOwner } from "../config";
import { AppError } from "../lib/errors";
import { logError, logInfo, logWarn } from "../lib/logging";
import { getFromCache, invalidateCacheForPath, setInCache } from "./cache";
import { mapGithubStatus } from "./status";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024;

type GithubRequestOptions = RequestInit & {
  responseType?: "json" | "text";
  /** GitHub owner (user or org) used to select the correct PAT. */
  owner?: string;
};

/**
 * Creates the cache representation identifier for a request.
 *
 * The identifier distinguishes response formats and media types so that,
 * for example, a JSON pull-request response cannot be returned for a
 * unified-diff request using the same endpoint.
 *
 * @param headers - The request headers.
 * @param responseType - The expected response type.
 * @returns A representation identifier suitable for cache keys and logs.
 */
function getCacheRepresentation(
  headers: Headers,
  responseType: "json" | "text",
): string {
  return `${responseType}:${headers.get("Accept") ?? "default"}`;
}

/**
 * Sends a request to the GitHub API.
 *
 * Successful GET responses are cached by method, path, body, and response
 * representation. Successful mutations invalidate related cached entries.
 *
 * @typeParam T - The expected response type.
 * @param path - The GitHub API path.
 * @param init - Optional request, authentication-owner, and response options.
 * @returns A promise resolving to the decoded GitHub response.
 * @throws {AppError} When GitHub returns a mapped API error or the response
 * exceeds the configured size limit.
 */
export async function githubRequest<T>(
  path: string,
  init: GithubRequestOptions = {},
): Promise<T> {
  const startedAt = Date.now();
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  const responseType = init.responseType ?? "json";
  const owner = init.owner ?? "";
  const { pat, key: patKey } = getGithubPatForOwner(owner);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/vnd.github+json");
  }

  const representation = getCacheRepresentation(headers, responseType);
  const bodyForCache = init.body
    ? JSON.parse(init.body as string)
    : undefined;

  if (method === "GET") {
    const cached = getFromCache<T>(
      method,
      path,
      bodyForCache,
      representation,
    );

    if (cached !== null) {
      const durationMs = Date.now() - startedAt;

      logInfo("github_cache_hit", {
        method,
        path,
        representation,
        durationMs,
      });

      clearTimeout(timeoutId);
      return cached;
    }
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
      const resetAt = resetEpoch
        ? new Date(Number(resetEpoch) * 1000).toISOString()
        : null;

      logWarn("github_rate_limit_low", {
        method,
        path,
        remaining: Number(remaining),
        resetAt,
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
      logError("github_response_too_large", {
        method,
        path,
        contentLength: Number(contentLength),
        limitBytes: MAX_RESPONSE_SIZE_BYTES,
      });

      throw new AppError("GitHub response too large", 413);
    }

    let result: T;

    if (responseType === "text") {
      result = (await response.text()) as T;
    } else {
      result = (await response.json()) as T;
    }

    if (method === "GET") {
      setInCache(method, path, bodyForCache, result, {
        representation,
      });

      logInfo("github_cache_set", {
        method,
        path,
        representation,
      });
    }

    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      invalidateCacheForPath(path);

      logInfo("github_cache_invalidated", {
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

      throw new AppError(
        `GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        504,
      );
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

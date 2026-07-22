import { getGithubPatForOwner } from "../config";
import { AppError } from "../lib/errors";
import { logError, logInfo, logWarn } from "../lib/logging";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

type GithubRequestOptions = RequestInit & {
  responseType?: "json" | "text";
  /** GitHub owner (user or org) used to select the correct PAT. */
  owner?: string;
};

function mapGithubStatus(status: number, body: string): AppError {
  switch (status) {
    case 401:
      return new AppError("GitHub authentication failed — check your PAT", 401);
    case 403: {
      // Rate limit exhausted vs plain forbidden
      if (body.includes("rate limit") || body.includes("API rate limit")) {
        return new AppError("GitHub rate limit exceeded — retry later", 429);
      }
      return new AppError(
        "GitHub request forbidden — insufficient PAT scopes",
        403,
      );
    }
    case 404:
      return new AppError("GitHub resource not found", 404);
    case 409:
      return new AppError(
        "GitHub conflict — resource already exists or is out of date",
        409,
      );
    case 422:
      return new AppError(`GitHub validation error: ${body}`, 422);
    case 429: {
      return new AppError("GitHub rate limit exceeded — retry later", 429);
    }
    default:
      return new AppError(
        `GitHub API error (${status}): ${body || "unknown error"}`,
        status,
      );
  }
}

export async function githubRequest<T>(
  path: string,
  init: GithubRequestOptions = {},
): Promise<T> {
  const startedAt = Date.now();
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  const responseType = init.responseType ?? "json";
  const owner = init.owner ?? "";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/vnd.github+json");
  }

  headers.set("Authorization", `Bearer ${getGithubPatForOwner(owner)}`);
  headers.set("User-Agent", "github-mcp-bridge");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  logInfo("github_request_started", {
    method,
    path,
    hasBody: Boolean(init.body),
    responseType,
    headers: {
      accept: headers.get("Accept"),
      authorization: headers.get("Authorization") ? "[present]" : "[missing]",
      userAgent: headers.get("User-Agent"),
      githubApiVersion: headers.get("X-GitHub-Api-Version"),
      contentType: headers.get("Content-Type"),
    },
  });

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startedAt;

    // Warn if rate limit is running low
    const remaining = response.headers.get("x-ratelimit-remaining");
    const resetEpoch = response.headers.get("x-ratelimit-reset");
    if (remaining !== null && Number(remaining) < 100) {
      const resetAt = resetEpoch
        ? new Date(Number(resetEpoch) * 1000).toISOString()
        : null;
      logWarn("github_rate_limit_low", {
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
        responseBody: text || null,
      });

      throw mapGithubStatus(response.status, text);
    }

    // Guard response size before reading into memory
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

    logInfo("github_request_succeeded", {
      method,
      path,
      status: response.status,
      durationMs,
    });

    if (responseType === "text") {
      return (await response.text()) as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startedAt;

    if (error instanceof Error && error.name === "AbortError") {
      logError("github_request_timeout", { method, path, durationMs });
      throw new AppError(
        `GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        504,
      );
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

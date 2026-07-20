import { getGithubPat } from "../config";
import { AppError } from "../lib/errors";
import { logError, logInfo } from "../lib/logging";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export async function githubRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const startedAt = Date.now();
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${getGithubPat()}`);
  headers.set("User-Agent", "github-mcp-bridge");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  logInfo("github_request_started", {
    method,
    path,
    hasBody: Boolean(init.body),
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
    });

    const durationMs = Date.now() - startedAt;

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

      throw new AppError(
        `GitHub API error (${response.status}): ${text || response.statusText}`,
        response.status,
      );
    }

    logInfo("github_request_succeeded", {
      method,
      path,
      status: response.status,
      durationMs,
    });

    return (await response.json()) as T;
  } catch (error) {
    const durationMs = Date.now() - startedAt;

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

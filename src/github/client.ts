import { getGithubPat } from "../config";
import { AppError } from "../lib/errors";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export async function githubRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${getGithubPat()}`);
  headers.set("User-Agent", "github-mcp-bridge");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(
      `GitHub API error (${response.status}): ${text || response.statusText}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

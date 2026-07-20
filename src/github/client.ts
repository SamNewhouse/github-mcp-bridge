import { env } from "../config";
import { AppError } from "../lib/errors";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export async function githubRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(init.headers ?? {}),
    },
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

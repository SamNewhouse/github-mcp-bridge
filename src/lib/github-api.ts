import { env } from "../config";
import { AppError } from "./errors";

const GITHUB_API_URL = "https://api.github.com";

type GitHubRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

export async function githubRequest<T>(
  path: string,
  options: GitHubRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      "User-Agent": "github-mcp-bridge",
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(
      `GitHub API error ${response.status}: ${text}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

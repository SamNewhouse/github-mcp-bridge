import { AppError } from "../lib/errors";
import { githubRequest } from "./client";

type GitHubContentFile = {
  type: "file";
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: "base64" | string;
  content: string;
};

type GitHubContentDirectoryEntry = {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size: number;
};

function buildContentsPath(path: string, ref?: string): string {
  const trimmedPath = path.trim();
  const encodedPath = trimmedPath
    ? trimmedPath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
    : "";

  const basePath = encodedPath ? `/contents/${encodedPath}` : "/contents";
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";

  return `${basePath}${query}`;
}

export async function getFileContents(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  const file = await githubRequest<GitHubContentFile>(
    `/repos/${owner}/${repo}${buildContentsPath(path, ref)}`,
  );

  if (file.type !== "file") {
    throw new AppError(`Path is not a file: ${path}`, 400);
  }

  const normalized = file.content.replace(/\n/g, "");
  const content =
    file.encoding === "base64"
      ? Buffer.from(normalized, "base64").toString("utf8")
      : file.content;

  return {
    name: file.name,
    path: file.path,
    sha: file.sha,
    size: file.size,
    content,
  };
}

export async function getMultipleFiles(
  owner: string,
  repo: string,
  paths: string[],
  ref?: string,
) {
  return Promise.all(paths.map((path) => getFileContents(owner, repo, path, ref)));
}

export async function listDirectory(
  owner: string,
  repo: string,
  path = "",
  ref?: string,
) {
  const entries = await githubRequest<GitHubContentDirectoryEntry[]>(
    `/repos/${owner}/${repo}${buildContentsPath(path, ref)}`,
  );

  if (!Array.isArray(entries)) {
    throw new AppError(`Path is not a directory: ${path || "/"}`, 400);
  }

  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    sha: entry.sha,
    size: entry.size,
    type: entry.type,
  }));
}

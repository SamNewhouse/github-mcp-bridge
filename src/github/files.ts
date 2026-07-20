import { Buffer } from "node:buffer";
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

type GitHubUpsertFileResponse = {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
  };
  commit: {
    sha: string;
    html_url: string;
    message: string;
  };
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
  return Promise.all(
    paths.map((path) => getFileContents(owner, repo, path, ref)),
  );
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

export async function upsertFile(
  owner: string,
  repo: string,
  input: {
    path: string;
    content: string;
    message: string;
    branch: string;
  },
) {
  let existingSha: string | undefined;

  try {
    const existing = await githubRequest<GitHubContentFile>(
      `/repos/${owner}/${repo}${buildContentsPath(input.path, input.branch)}`,
    );

    if (existing.type === "file") {
      existingSha = existing.sha;
    }
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 404) {
      throw error;
    }
  }

  const response = await githubRequest<GitHubUpsertFileResponse>(
    `/repos/${owner}/${repo}${buildContentsPath(input.path)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    },
  );

  return {
    file: {
      name: response.content.name,
      path: response.content.path,
      sha: response.content.sha,
      size: response.content.size,
    },
    commit: {
      sha: response.commit.sha,
      html_url: response.commit.html_url,
      message: response.commit.message,
    },
    created: !existingSha,
  };
}

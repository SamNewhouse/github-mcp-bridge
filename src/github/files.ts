import { Buffer } from "node:buffer";
import { AppError } from "../lib/errors";
import type { PatchOp } from "../lib/validation";
import { githubRequest } from "./client";

// Keep each response comfortably under Vercel's 4.5 MB payload cap.
// 3.5 MB leaves headroom for the JSON envelope and other response fields.
const CONTENT_BYTE_BUDGET = 3.5 * 1024 * 1024;

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

type GitHubDeleteFileResponse = {
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

function decodeFileContent(file: GitHubContentFile): string {
  const normalized = file.content.replace(/\n/g, "");
  return file.encoding === "base64"
    ? Buffer.from(normalized, "base64").toString("utf8")
    : file.content;
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

  const content = decodeFileContent(file);
  const byteLength = Buffer.byteLength(content, "utf8");

  if (byteLength > CONTENT_BYTE_BUDGET) {
    const truncatedContent = content.slice(
      0,
      // Slice by chars, not bytes — close enough for UTF-8 prose
      Math.floor(CONTENT_BYTE_BUDGET),
    );

    return {
      name: file.name,
      path: file.path,
      sha: file.sha,
      size: file.size,
      content: truncatedContent,
      truncated: true,
      truncatedAt: CONTENT_BYTE_BUDGET,
      fullSizeBytes: byteLength,
    };
  }

  return {
    name: file.name,
    path: file.path,
    sha: file.sha,
    size: file.size,
    content,
    truncated: false,
  };
}

export type PaginatedFilesResult = {
  files: Awaited<ReturnType<typeof getFileContents>>[];
  pagination: {
    cursor: number;
    pageSize: number;
    total: number;
    returned: number;
    hasMore: boolean;
    nextCursor: number | null;
  };
};

export async function getMultipleFiles(
  owner: string,
  repo: string,
  paths: string[],
  ref?: string,
  cursor = 0,
  pageSize = 10,
): Promise<PaginatedFilesResult> {
  // Deduplicate to avoid wasted GitHub API calls
  const uniquePaths = [...new Set(paths)];

  const total = uniquePaths.length;
  const start = Math.min(cursor, total);
  const end = Math.min(start + pageSize, total);
  const page = uniquePaths.slice(start, end);

  // Fetch files sequentially, accumulate byte count, stop if budget would be exceeded
  const files: Awaited<ReturnType<typeof getFileContents>>[] = [];
  let bytesUsed = 0;
  let stoppedEarlyAt: number | null = null;

  for (let i = 0; i < page.length; i++) {
    const file = await getFileContents(owner, repo, page[i]!, ref);
    const fileBytes = Buffer.byteLength(
      typeof file.content === "string" ? file.content : "",
      "utf8",
    );

    // Always include the first file even if it alone exceeds the budget —
    // otherwise a single oversized file would loop forever returning nothing.
    if (files.length > 0 && bytesUsed + fileBytes > CONTENT_BYTE_BUDGET) {
      // Adding this file would exceed the budget — stop here and adjust cursor
      stoppedEarlyAt = start + i;
      break;
    }

    bytesUsed += fileBytes;
    files.push(file);
  }

  const effectiveEnd = stoppedEarlyAt ?? end;
  const hasMore = effectiveEnd < total;

  return {
    files,
    pagination: {
      cursor: start,
      pageSize,
      total,
      returned: files.length,
      hasMore,
      nextCursor: hasMore ? effectiveEnd : null,
    },
  };
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

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------
export async function deleteFile(
  owner: string,
  repo: string,
  input: {
    path: string;
    branch: string;
    message: string;
  },
) {
  // Fetch the current file to obtain its SHA (required by the GitHub API).
  const existing = await githubRequest<GitHubContentFile>(
    `/repos/${owner}/${repo}${buildContentsPath(input.path, input.branch)}`,
  );

  if (existing.type !== "file") {
    throw new AppError(`Path is not a file: ${input.path}`, 400);
  }

  const response = await githubRequest<GitHubDeleteFileResponse>(
    `/repos/${owner}/${repo}${buildContentsPath(input.path)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        sha: existing.sha,
        branch: input.branch,
      }),
    },
  );

  return {
    deleted: true,
    path: input.path,
    commit: {
      sha: response.commit.sha,
      html_url: response.commit.html_url,
      message: response.commit.message,
    },
  };
}

// ---------------------------------------------------------------------------
// patch_file
// ---------------------------------------------------------------------------

/** Apply a single patch operation to a text string. */
function applyPatchOp(content: string, op: PatchOp): string {
  switch (op.op) {
    case "replace_once": {
      if (!content.includes(op.find)) {
        throw new AppError(
          `patch_file: replace_once — find text not found: ${JSON.stringify(op.find)}`,
          422,
        );
      }
      return content.replace(op.find, op.replace);
    }

    case "replace_all": {
      if (!content.includes(op.find)) {
        throw new AppError(
          `patch_file: replace_all — find text not found: ${JSON.stringify(op.find)}`,
          422,
        );
      }
      // Escape special regex characters so literal strings are matched.
      const escaped = op.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return content.replace(new RegExp(escaped, "g"), op.replace);
    }

    case "insert_before": {
      if (!content.includes(op.anchor)) {
        throw new AppError(
          `patch_file: insert_before — anchor text not found: ${JSON.stringify(op.anchor)}`,
          422,
        );
      }
      return content.replace(op.anchor, `${op.content}${op.anchor}`);
    }

    case "insert_after": {
      if (!content.includes(op.anchor)) {
        throw new AppError(
          `patch_file: insert_after — anchor text not found: ${JSON.stringify(op.anchor)}`,
          422,
        );
      }
      return content.replace(op.anchor, `${op.anchor}${op.content}`);
    }
  }
}

export async function patchFile(
  owner: string,
  repo: string,
  input: {
    path: string;
    branch: string;
    message: string;
    patches: PatchOp[];
  },
) {
  // Read the current file.
  const existing = await githubRequest<GitHubContentFile>(
    `/repos/${owner}/${repo}${buildContentsPath(input.path, input.branch)}`,
  );

  if (existing.type !== "file") {
    throw new AppError(`Path is not a file: ${input.path}`, 400);
  }

  // Reject binary content — base64-encoded binary will not decode to valid UTF-8 text.
  const rawContent = existing.content.replace(/\n/g, "");
  if (existing.encoding !== "base64") {
    throw new AppError(
      `patch_file: unsupported encoding "${existing.encoding}"`,
      422,
    );
  }

  let text = Buffer.from(rawContent, "base64").toString("utf8");

  // Heuristic binary guard: if the decoded content contains a null byte it is
  // almost certainly binary — refuse rather than corrupt.
  if (text.includes("\0")) {
    throw new AppError(
      `patch_file: refusing to patch binary file: ${input.path}`,
      422,
    );
  }

  // Apply each patch in order.
  for (const op of input.patches) {
    text = applyPatchOp(text, op);
  }

  // Write the patched content back.
  const response = await githubRequest<GitHubUpsertFileResponse>(
    `/repos/${owner}/${repo}${buildContentsPath(input.path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(text, "utf8").toString("base64"),
        branch: input.branch,
        sha: existing.sha,
      }),
    },
  );

  return {
    patched: true,
    path: input.path,
    patchesApplied: input.patches.length,
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
  };
}

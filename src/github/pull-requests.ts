import { AppError } from "../lib/errors";
import { githubRequest } from "./client";

type GitHubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  mergeable?: boolean | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

type GitHubPullRequestFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url: string;
  raw_url: string;
};

// Conversation comments (issue-style, left on the PR timeline).
// Inline review comments on specific lines live at /pulls/{pull_number}/comments.
type GitHubConversationComment = {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  };
};

type GitHubCreatePullRequestInput = {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
};

// GitHub caps per_page at 100 — PRs with > 100 changed files will be truncated.
const PR_FILES_PAGE_LIMIT = 100;

function mapPullRequest(pr: GitHubPullRequest) {
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    draft: pr.draft ?? false,
    html_url: pr.html_url,
    author: pr.user.login,
    head: pr.head.ref,
    headSha: pr.head.sha,
    base: pr.base.ref,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    mergeable: pr.mergeable ?? null,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changed_files: pr.changed_files ?? 0,
  };
}

export async function listOpenPullRequests(owner: string, repo: string) {
  const prs = await githubRequest<GitHubPullRequest[]>(
    `/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
  );

  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    html_url: pr.html_url,
    author: pr.user.login,
    head: pr.head.ref,
    base: pr.base.ref,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
  }));
}

export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const pr = await githubRequest<GitHubPullRequest>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
  );

  return mapPullRequest(pr);
}

export async function listPullRequestFiles(
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const files = await githubRequest<GitHubPullRequestFile[]>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=${PR_FILES_PAGE_LIMIT}`,
  );

  return {
    files: files.map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch ?? null,
      blob_url: file.blob_url,
      raw_url: file.raw_url,
    })),
    // If exactly 100 files are returned the PR may have more — treat as potentially incomplete.
    truncated: files.length === PR_FILES_PAGE_LIMIT,
  };
}

export async function listPullRequestComments(
  owner: string,
  repo: string,
  pullNumber: number,
) {
  // Returns conversation comments from the PR timeline (issue-style).
  // Inline review comments on specific lines live at /pulls/${pullNumber}/comments.
  const comments = await githubRequest<GitHubConversationComment[]>(
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`,
  );

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    html_url: comment.html_url,
    author: comment.user.login,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  }));
}

export async function updatePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  input: {
    title?: string;
    body?: string;
    base?: string;
    state?: "open" | "closed";
  },
) {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload.title = input.title;
  if (input.body !== undefined) payload.body = input.body;
  if (input.base !== undefined) payload.base = input.base;
  if (input.state !== undefined) payload.state = input.state;

  if (Object.keys(payload).length === 0) {
    throw new AppError("No update fields provided", 400);
  }

  const pr = await githubRequest<GitHubPullRequest>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return mapPullRequest(pr);
}

export async function createPullRequest(
  owner: string,
  repo: string,
  input: GitHubCreatePullRequestInput,
) {
  const pr = await githubRequest<GitHubPullRequest>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body ?? "",
        head: input.head,
        base: input.base,
        ...(input.draft !== undefined ? { draft: input.draft } : {}),
      }),
    },
  );

  return mapPullRequest(pr);
}

export async function getPullRequestDiff(
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const diff = await githubRequest<string>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      headers: {
        Accept: "application/vnd.github.diff",
      },
      responseType: "text",
    },
  );

  return {
    pullNumber,
    diff,
  };
}

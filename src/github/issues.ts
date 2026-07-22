import { AppError } from "../lib/errors";
import { githubRequest } from "./client";

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  };
  labels: {
    name: string;
    color: string;
  }[];
  assignees: {
    login: string;
  }[];
  comments: number;
  pull_request?: unknown;
};

type GitHubIssueComment = {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  };
};

type GitHubCreateIssueInput = {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
};

type GitHubUpdateIssueInput = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
};

export async function listIssues(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
) {
  const issues = await githubRequest<GitHubIssue[]>(
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=100`,
    { owner },
  );

  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      author: issue.user.login,
      labels: issue.labels.map((l) => l.name),
      assignees: issue.assignees.map((a) => a.login),
      comments: issue.comments,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    }));
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const issue = await githubRequest<GitHubIssue>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    { owner },
  );

  if (issue.pull_request) {
    throw new AppError("Requested number is a pull request, not an issue", 400);
  }

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    html_url: issue.html_url,
    author: issue.user.login,
    labels: issue.labels.map((l) => l.name),
    assignees: issue.assignees.map((a) => a.login),
    comments: issue.comments,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
  };
}

export async function createIssue(
  owner: string,
  repo: string,
  input: GitHubCreateIssueInput,
) {
  const issue = await githubRequest<GitHubIssue>(
    `/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body ?? "",
        ...(input.labels ? { labels: input.labels } : {}),
        ...(input.assignees ? { assignees: input.assignees } : {}),
      }),
      owner,
    },
  );

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    html_url: issue.html_url,
    author: issue.user.login,
    labels: issue.labels.map((l) => l.name),
    assignees: issue.assignees.map((a) => a.login),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
  };
}

export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  input: GitHubUpdateIssueInput,
) {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload.title = input.title;
  if (input.body !== undefined) payload.body = input.body;
  if (input.state !== undefined) payload.state = input.state;
  if (input.labels !== undefined) payload.labels = input.labels;
  if (input.assignees !== undefined) payload.assignees = input.assignees;

  if (Object.keys(payload).length === 0) {
    throw new AppError("No update fields provided", 400);
  }

  const issue = await githubRequest<GitHubIssue>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      owner,
    },
  );

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    html_url: issue.html_url,
    author: issue.user.login,
    labels: issue.labels.map((l) => l.name),
    assignees: issue.assignees.map((a) => a.login),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
  };
}

export async function linkIssueToPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  issueNumber: number,
  keyword: "closes" | "fixes" | "resolves" = "closes",
) {
  const pr = await githubRequest<{ body: string | null; number: number }>(
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    { owner },
  );

  const linkText = `\n\n${keyword} #${issueNumber}`;
  const currentBody = pr.body ?? "";

  const alreadyLinked = new RegExp(
    `(closes|fixes|resolves)\\s+#${issueNumber}`,
    "i",
  ).test(currentBody);

  if (alreadyLinked) {
    return {
      pullNumber,
      issueNumber,
      linked: false,
      reason: `Issue #${issueNumber} is already linked in the PR body`,
    };
  }

  await githubRequest<unknown>(`/repos/${owner}/${repo}/pulls/${pullNumber}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: currentBody + linkText }),
    owner,
  });

  return {
    pullNumber,
    issueNumber,
    linked: true,
    keyword,
  };
}

export async function listIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const comments = await githubRequest<GitHubIssueComment[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    { owner },
  );

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    html_url: c.html_url,
    author: c.user.login,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
) {
  const comment = await githubRequest<GitHubIssueComment>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
      owner,
    },
  );

  return {
    id: comment.id,
    body: comment.body,
    html_url: comment.html_url,
    author: comment.user.login,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
}

import { githubRequest } from "./client";

type GitHubCommitDetail = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      date: string;
    };
  };
  author: { login: string } | null;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }[];
};

type GitHubCommitSummary = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: { login: string } | null;
};

export async function getCommit(
  owner: string,
  repo: string,
  ref: string,
) {
  const commit = await githubRequest<GitHubCommitDetail>(
    `/repos/${owner}/${repo}/commits/${ref}`,
  );

  return {
    sha: commit.sha,
    html_url: commit.html_url,
    message: commit.commit.message,
    author: commit.commit.author.name,
    author_login: commit.author?.login ?? null,
    date: commit.commit.author.date,
    stats: commit.stats ?? null,
    files: commit.files?.map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch ?? null,
    })) ?? [],
  };
}

export async function listCommits(
  owner: string,
  repo: string,
  branch?: string,
  path?: string,
  perPage = 30,
) {
  const params = new URLSearchParams();
  if (branch) params.set("sha", branch);
  if (path) params.set("path", path);
  params.set("per_page", String(perPage));

  const commits = await githubRequest<GitHubCommitSummary[]>(
    `/repos/${owner}/${repo}/commits?${params.toString()}`,
  );

  return commits.map((c) => ({
    sha: c.sha,
    html_url: c.html_url,
    message: c.commit.message,
    author: c.commit.author.name,
    author_login: c.author?.login ?? null,
    date: c.commit.author.date,
  }));
}

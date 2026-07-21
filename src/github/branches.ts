import { githubRequest } from "./client";

type GitHubBranch = {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
};

type GitHubBranchDetail = {
  name: string;
  commit: {
    sha: string;
    html_url: string;
    commit: {
      message: string;
      author: {
        name: string;
        date: string;
      };
    };
  };
  protected: boolean;
  protection?: {
    required_status_checks?: {
      strict: boolean;
      contexts: string[];
    };
  };
};

export async function listBranches(owner: string, repo: string) {
  const branches = await githubRequest<GitHubBranch[]>(
    `/repos/${owner}/${repo}/branches?per_page=100`,
  );

  return branches.map((branch) => ({
    name: branch.name,
    sha: branch.commit.sha,
    protected: branch.protected,
  }));
}

export async function createBranch(
  owner: string,
  repo: string,
  baseBranch: string,
  newBranch: string,
) {
  const base = await githubRequest<GitHubBranch>(
    `/repos/${owner}/${repo}/branches/${baseBranch}`,
  );

  const sha = base.commit.sha;

  await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${newBranch}`,
      sha,
    }),
  });

  return { name: newBranch, sha };
}

export async function getBranch(owner: string, repo: string, branch: string) {
  const result = await githubRequest<GitHubBranchDetail>(
    `/repos/${owner}/${repo}/branches/${branch}`,
  );

  return {
    name: result.name,
    sha: result.commit.sha,
    html_url: result.commit.html_url,
    protected: result.protected,
    latest_commit: {
      message: result.commit.commit.message,
      author: result.commit.commit.author.name,
      date: result.commit.commit.author.date,
    },
  };
}

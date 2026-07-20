import { githubRequest } from "./lib/github-api";

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  updated_at: string;
  default_branch: string;
  owner: {
    login: string;
  };
};

type GitHubBranch = {
  name: string;
  protected: boolean;
  commit: {
    sha: string;
  };
};

type GitHubPullRequest = {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
  user?: {
    login: string;
  } | null;
};

type GitHubRefResponse = {
  ref: string;
  url: string;
  object: {
    sha: string;
  };
};

type GitHubBranchResponse = {
  commit: {
    sha: string;
  };
};

export async function listRepositories() {
  const repos = await githubRequest<GitHubRepo[]>(
    "/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100",
  );

  return repos.map((repo) => ({
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    default_branch: repo.default_branch,
    html_url: repo.html_url,
    updated_at: repo.updated_at,
  }));
}

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

export async function listOpenPullRequests(owner: string, repo: string) {
  const pullRequests = await githubRequest<GitHubPullRequest[]>(
    `/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
  );

  return pullRequests.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft ?? false,
    html_url: pr.html_url,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    head: pr.head.ref,
    base: pr.base.ref,
    user: pr.user?.login ?? null,
  }));
}

export async function createBranch(
  owner: string,
  repo: string,
  baseBranch: string,
  newBranch: string,
) {
  const base = await githubRequest<GitHubBranchResponse>(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(baseBranch)}`,
  );

  const created = await githubRequest<GitHubRefResponse>(
    `/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      body: {
        ref: `refs/heads/${newBranch}`,
        sha: base.commit.sha,
      },
    },
  );

  return {
    ref: created.ref,
    sha: created.object.sha,
    url: created.url,
  };
}

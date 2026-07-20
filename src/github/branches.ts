import { githubRequest } from "./client";

type GitHubBranch = {
  name: string;
  commit: {
    sha: string;
  };
  protected: boolean;
};

type GitHubRef = {
  ref: string;
  object: {
    sha: string;
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
  const baseRef = await githubRequest<GitHubRef>(
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
  );

  const created = await githubRequest<GitHubRef>(
    `/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: baseRef.object.sha,
      }),
    },
  );

  return {
    name: created.ref.replace("refs/heads/", ""),
    sha: created.object.sha,
  };
}

import { githubRequest } from "./client";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  updated_at: string;
  owner: { login: string };
};

export async function listRepositories() {
  const repos = await githubRequest<GitHubRepository[]>(
    "/user/repos?sort=updated&per_page=100",
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

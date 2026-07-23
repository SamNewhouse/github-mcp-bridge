import { githubRequest } from "./client";

type GitHubFullRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  created_at: string;
  updated_at: string;
  owner: { login: string };
  topics: string[];
  visibility: string;
};

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

export async function getRepository(owner: string, repo: string) {
  const r = await githubRequest<GitHubFullRepository>(
    `/repos/${owner}/${repo}`,
    { owner },
  );

  return {
    id: r.id,
    owner: r.owner.login,
    name: r.name,
    full_name: r.full_name,
    private: r.private,
    default_branch: r.default_branch,
    html_url: r.html_url,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    open_issues_count: r.open_issues_count,
    topics: r.topics ?? [],
    visibility: r.visibility,
    pushed_at: r.pushed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

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

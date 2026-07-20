import { githubRequest } from "./client";

type GitHubPullRequest = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  };
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
};

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

import { githubRequest } from "./client";

type GitHubCodeSearchItem = {
  name: string;
  path: string;
  sha: string;
  url: string;
  html_url: string;
  repository: {
    full_name: string;
  };
  text_matches?: {
    fragment: string;
    matches: { text: string; indices: number[] }[];
  }[];
};

type GitHubCodeSearchResult = {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubCodeSearchItem[];
};

type GitHubTreeItem = {
  path?: string;
  type?: string;
  sha?: string;
  url?: string;
};

type GitHubTreeResult = {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
};

export async function searchCode(owner: string, repo: string, query: string) {
  const encodedQuery = encodeURIComponent(`${query} repo:${owner}/${repo}`);
  const result = await githubRequest<GitHubCodeSearchResult>(
    `/search/code?q=${encodedQuery}&per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github.text-match+json",
      },
    },
  );

  return {
    total_count: result.total_count,
    incomplete_results: result.incomplete_results,
    items: result.items.map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      html_url: item.html_url,
      repository: item.repository.full_name,
      matches: item.text_matches?.map((m) => m.fragment) ?? [],
    })),
  };
}

export async function searchFiles(
  owner: string,
  repo: string,
  pattern: string,
  ref?: string,
) {
  const branch = ref ?? "HEAD";
  const result = await githubRequest<GitHubTreeResult>(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  );

  const lowerPattern = pattern.toLowerCase();
  const matched = result.tree.filter(
    (item) =>
      item.type === "blob" && item.path?.toLowerCase().includes(lowerPattern),
  );

  return {
    truncated: result.truncated,
    total_matched: matched.length,
    files: matched.map((item) => ({
      path: item.path ?? "",
      sha: item.sha ?? "",
    })),
  };
}

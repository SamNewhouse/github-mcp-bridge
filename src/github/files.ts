import { githubRequest } from "./client";

type GitHubContentFile = {
  type: "file";
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: "base64" | string;
  content: string;
};

export async function getFileContents(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";

  const file = await githubRequest<GitHubContentFile>(
    `/repos/${owner}/${repo}/contents/${path}${query}`,
  );

  if (file.type !== "file") {
    throw new Error(`Path is not a file: ${path}`);
  }

  const normalized = file.content.replace(/\n/g, "");
  const content =
    file.encoding === "base64"
      ? Buffer.from(normalized, "base64").toString("utf8")
      : file.content;

  return {
    name: file.name,
    path: file.path,
    sha: file.sha,
    size: file.size,
    content,
  };
}

export async function getMultipleFiles(
  owner: string,
  repo: string,
  paths: string[],
  ref?: string,
) {
  const files = await Promise.all(
    paths.map((path) => getFileContents(owner, repo, path, ref)),
  );

  return files;
}

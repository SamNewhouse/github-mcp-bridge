import { listCommitsInputSchema } from "../lib/validation";
import { listCommits } from "../github";
import { defineTool } from "./shared";

export const listCommitsTool = defineTool({
  name: "list_commits",
  description:
    "List commits for a repository. Optionally filter by branch or file path.",
  input: listCommitsInputSchema,
  handler: async ({ owner, repo, branch, path, perPage }) => ({
    commits: await listCommits(owner, repo, branch, path, perPage),
  }),
});

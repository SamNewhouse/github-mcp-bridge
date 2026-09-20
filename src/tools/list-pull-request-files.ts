import { pullRequestInputSchema } from "../lib/validation";
import { listPullRequestFiles } from "../github";
import { defineTool } from "./shared";

export const listPullRequestFilesTool = defineTool({
  name: "list_pull_request_files",
  description: "List files changed in a pull request.",
  input: pullRequestInputSchema,
  handler: async ({ owner, repo, pull_number }) => ({
    files: await listPullRequestFiles(owner, repo, pull_number),
  }),
});

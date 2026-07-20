import { pullRequestInputSchema } from "../lib/validation";
import { getPullRequestDiff } from "../github";
import { defineTool } from "./shared";

export const getPullRequestDiffTool = defineTool({
  name: "get_pull_request_diff",
  description: "Get the unified diff for a pull request.",
  input: pullRequestInputSchema,
  handler: async ({ owner, repo, pullNumber }) => ({
    diff: await getPullRequestDiff(owner, repo, pullNumber),
  }),
});

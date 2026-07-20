import { pullRequestInputSchema } from "../lib/validation";
import { getPullRequest } from "../github";
import { defineTool } from "./shared";

export const getPullRequestTool = defineTool({
  name: "get_pull_request",
  description: "Get a pull request by number.",
  input: pullRequestInputSchema,
  handler: async ({ owner, repo, pullNumber }) => ({
    pullRequest: await getPullRequest(owner, repo, pullNumber),
  }),
});

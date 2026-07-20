import { updatePullRequestInputSchema } from "../lib/validation";
import { updatePullRequest } from "../github";
import { defineTool } from "./shared";

export const updatePullRequestTool = defineTool({
  name: "update_pull_request",
  description: "Update a pull request.",
  input: updatePullRequestInputSchema,
  handler: async ({ owner, repo, pullNumber, title, body, base, state }) => ({
    pullRequest: await updatePullRequest(owner, repo, pullNumber, {
      title,
      body,
      base,
      state,
    }),
  }),
});

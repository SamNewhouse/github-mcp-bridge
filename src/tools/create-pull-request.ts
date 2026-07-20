import { createPullRequestInputSchema } from "../lib/validation";
import { createPullRequest } from "../github";
import { defineTool } from "./shared";

export const createPullRequestTool = defineTool({
  name: "create_pull_request",
  description: "Create a pull request.",
  input: createPullRequestInputSchema,
  handler: async ({ owner, repo, title, body, head, base, draft }) => ({
    pullRequest: await createPullRequest(owner, repo, {
      title,
      body,
      head,
      base,
      draft,
    }),
  }),
});

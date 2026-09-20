import { pullRequestInputSchema } from "../lib/validation";
import { listPullRequestComments } from "../github";
import { defineTool } from "./shared";

export const listPullRequestCommentsTool = defineTool({
  name: "list_pull_request_comments",
  description: "List comments on a pull request.",
  input: pullRequestInputSchema,
  handler: async ({ owner, repo, pull_number }) => ({
    comments: await listPullRequestComments(owner, repo, pull_number),
  }),
});

import { addPullRequestComment } from "../github";
import { addPullRequestCommentInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const addPullRequestCommentTool = defineTool({
  name: "add_pull_request_comment",
  description: "Post a conversation comment on a pull request.",
  input: addPullRequestCommentInputSchema,
  handler: async ({ owner, repo, pull_number, body }) => ({
    comment: await addPullRequestComment(owner, repo, pull_number, body),
  }),
});

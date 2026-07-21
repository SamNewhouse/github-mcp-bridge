import { issueCommentInputSchema } from "../lib/validation";
import { addIssueComment } from "../github";
import { defineTool } from "./shared";

export const addIssueCommentTool = defineTool({
  name: "add_issue_comment",
  description: "Post a comment on an issue.",
  input: issueCommentInputSchema,
  handler: async ({ owner, repo, issueNumber, body }) => ({
    comment: await addIssueComment(owner, repo, issueNumber, body),
  }),
});

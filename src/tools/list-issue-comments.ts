import { issueInputSchema } from "../lib/validation";
import { listIssueComments } from "../github";
import { defineTool } from "./shared";

export const listIssueCommentsTool = defineTool({
  name: "list_issue_comments",
  description: "List all comments on an issue.",
  input: issueInputSchema,
  handler: async ({ owner, repo, issue_number }) => ({
    comments: await listIssueComments(owner, repo, issue_number),
  }),
});

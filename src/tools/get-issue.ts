import { issueInputSchema } from "../lib/validation";
import { getIssue } from "../github";
import { defineTool } from "./shared";

export const getIssueTool = defineTool({
  name: "get_issue",
  description: "Get a single issue by number.",
  input: issueInputSchema,
  handler: async ({ owner, repo, issue_number }) => ({
    issue: await getIssue(owner, repo, issue_number),
  }),
});

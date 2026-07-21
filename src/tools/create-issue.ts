import { createIssueInputSchema } from "../lib/validation";
import { createIssue } from "../github";
import { defineTool } from "./shared";

export const createIssueTool = defineTool({
  name: "create_issue",
  description: "Create a new issue in a repository.",
  input: createIssueInputSchema,
  handler: async ({ owner, repo, title, body, labels, assignees }) => ({
    issue: await createIssue(owner, repo, { title, body, labels, assignees }),
  }),
});

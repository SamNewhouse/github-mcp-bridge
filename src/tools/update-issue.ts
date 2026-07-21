import { updateIssueInputSchema } from "../lib/validation";
import { updateIssue } from "../github";
import { defineTool } from "./shared";

export const updateIssueTool = defineTool({
  name: "update_issue",
  description:
    "Update an existing issue. Can change title, body, state (open/closed), labels, and assignees.",
  input: updateIssueInputSchema,
  handler: async ({
    owner,
    repo,
    issueNumber,
    title,
    body,
    state,
    labels,
    assignees,
  }) => ({
    issue: await updateIssue(owner, repo, issueNumber, {
      title,
      body,
      state,
      labels,
      assignees,
    }),
  }),
});

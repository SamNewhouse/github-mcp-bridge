import { listIssuesInputSchema } from "../lib/validation";
import { listIssues } from "../github";
import { defineTool } from "./shared";

export const listIssuesTool = defineTool({
  name: "list_issues",
  description:
    "List issues for a repository. Excludes pull requests. Defaults to open issues.",
  input: listIssuesInputSchema,
  handler: async ({ owner, repo, state }) => ({
    issues: await listIssues(owner, repo, state),
  }),
});

import { listPullRequestsInputSchema } from "../lib/validation";
import { listPullRequests } from "../github";
import { defineTool } from "./shared";

export const listPullRequestsTool = defineTool({
  name: "list_pull_requests",
  description:
    "List pull requests for a repository. Supports filtering by state (open, closed, all). Defaults to open.",
  input: listPullRequestsInputSchema,
  handler: async ({ owner, repo, state }) => ({
    pull_requests: await listPullRequests(owner, repo, state),
  }),
});

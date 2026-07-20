import { repositoryInputSchema } from "../lib/validation";
import { listOpenPullRequests } from "../github";
import { defineTool } from "./shared";

export const listOpenPullRequestsTool = defineTool({
  name: "list_open_pull_requests",
  description: "List open pull requests for a repository.",
  input: repositoryInputSchema,
  handler: async ({ owner, repo }) => ({
    pull_requests: await listOpenPullRequests(owner, repo),
  }),
});

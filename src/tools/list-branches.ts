import { repositoryInputSchema } from "../lib/validation";
import { listBranches } from "../github";
import { defineTool } from "./shared";

export const listBranchesTool = defineTool({
  name: "list_branches",
  description: "List branches for a repository.",
  input: repositoryInputSchema,
  handler: async ({ owner, repo }) => ({
    branches: await listBranches(owner, repo),
  }),
});

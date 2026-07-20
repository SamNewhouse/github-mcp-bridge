import { createBranchInputSchema } from "../lib/validation";
import { createBranch } from "../github";
import { defineTool } from "./shared";

export const createBranchTool = defineTool({
  name: "create_branch",
  description: "Create a branch from an existing base branch.",
  input: createBranchInputSchema,
  handler: async ({ owner, repo, baseBranch, newBranch }) => ({
    branch: await createBranch(owner, repo, baseBranch, newBranch),
  }),
});

import { getBranchInputSchema } from "../lib/validation";
import { getBranch } from "../github";
import { defineTool } from "./shared";

export const getBranchTool = defineTool({
  name: "get_branch",
  description:
    "Get details of a specific branch including its latest commit SHA, message, and protection status.",
  input: getBranchInputSchema,
  handler: async ({ owner, repo, branch }) => ({
    branch: await getBranch(owner, repo, branch),
  }),
});

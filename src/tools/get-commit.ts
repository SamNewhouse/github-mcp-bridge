import { getCommitInputSchema } from "../lib/validation";
import { getCommit } from "../github";
import { defineTool } from "./shared";

export const getCommitTool = defineTool({
  name: "get_commit",
  description:
    "Get details of a specific commit by SHA or ref, including changed files and diff stats.",
  input: getCommitInputSchema,
  handler: async ({ owner, repo, ref }) => ({
    commit: await getCommit(owner, repo, ref),
  }),
});

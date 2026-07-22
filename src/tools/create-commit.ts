import { createCommit } from "../github";
import { createCommitInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const createCommitTool = defineTool({
  name: "create_commit",
  description:
    "Create a single commit that writes multiple files to a repository branch.",
  input: createCommitInputSchema,
  handler: async ({ owner, repo, branch, message, files }) => ({
    result: await createCommit(owner, repo, {
      branch,
      message,
      files,
    }),
  }),
});

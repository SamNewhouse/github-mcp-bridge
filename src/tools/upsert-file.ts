import { upsertFileInputSchema } from "../lib/validation";
import { upsertFile } from "../github";
import { defineTool } from "./shared";

export const upsertFileTool = defineTool({
  name: "upsert_file",
  description: "Create or update a file in a repository branch.",
  input: upsertFileInputSchema,
  handler: async ({ owner, repo, path, content, message, branch }) => ({
    result: await upsertFile(owner, repo, {
      path,
      content,
      message,
      branch,
    }),
  }),
});

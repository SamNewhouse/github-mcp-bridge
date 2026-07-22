import { batchUpsertFiles } from "../github";
import { batchUpsertFilesInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const batchUpsertFilesTool = defineTool({
  name: "batch_upsert_files",
  description:
    "Create or update multiple files in a repository branch in a single commit.",
  input: batchUpsertFilesInputSchema,
  handler: async ({ owner, repo, branch, message, files }) => ({
    result: await batchUpsertFiles(owner, repo, {
      branch,
      message,
      files,
    }),
  }),
});

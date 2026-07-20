import { getMultipleFilesInputSchema } from "../lib/validation";
import { getMultipleFiles } from "../github";
import { defineTool } from "./shared";

export const getMultipleFilesTool = defineTool({
  name: "get_multiple_files",
  description: "Get the contents of multiple files in a repository.",
  input: getMultipleFilesInputSchema,
  handler: async ({ owner, repo, paths, ref }) => ({
    files: await getMultipleFiles(owner, repo, paths, ref),
  }),
});

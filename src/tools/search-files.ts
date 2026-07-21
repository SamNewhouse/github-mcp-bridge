import { searchFilesInputSchema } from "../lib/validation";
import { searchFiles } from "../github";
import { defineTool } from "./shared";

export const searchFilesTool = defineTool({
  name: "search_files",
  description:
    "Search for files by name or path pattern within a repository. Uses the git tree so no query limits apply.",
  input: searchFilesInputSchema,
  handler: async ({ owner, repo, pattern, ref }) => ({
    results: await searchFiles(owner, repo, pattern, ref),
  }),
});

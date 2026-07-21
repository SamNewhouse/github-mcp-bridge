import { searchCodeInputSchema } from "../lib/validation";
import { searchCode } from "../github";
import { defineTool } from "./shared";

export const searchCodeTool = defineTool({
  name: "search_code",
  description: "Search for code matching a query within a repository. Returns file paths, match fragments, and links.",
  input: searchCodeInputSchema,
  handler: async ({ owner, repo, query }) => ({
    results: await searchCode(owner, repo, query),
  }),
});

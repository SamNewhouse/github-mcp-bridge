import { getMultipleFilesInputSchema } from "../lib/validation";
import { getMultipleFiles } from "../github";
import { defineTool } from "./shared";

export const getMultipleFilesTool = defineTool({
  name: "get_multiple_files",
  description: [
    "Get the contents of multiple files in a repository.",
    "Results are paginated to stay within response size limits.",
    "Pass the full list of paths on every call — pagination is controlled by cursor and pageSize.",
    "Default page size is 6 files. When hasMore is true, call again with nextCursor as the cursor to fetch the next page.",
    "Each file includes a truncated flag — if true the content was cut at 3.5 MB and fullSizeBytes shows the real size.",
  ].join(" "),
  input: getMultipleFilesInputSchema,
  handler: async ({ owner, repo, paths, ref, cursor, pageSize }) =>
    getMultipleFiles(owner, repo, paths, ref, cursor, pageSize),
});

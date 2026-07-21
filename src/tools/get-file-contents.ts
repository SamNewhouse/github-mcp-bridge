import { getFileContents } from "../github";
import { getFileContentsInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const getFileContentsTool = defineTool({
  name: "get_file_contents",
  description: [
    "Get the contents of a file in a repository.",
    "Files larger than 3.5 MB are truncated — check the truncated flag in the response.",
    "When truncated is true, content is cut at 3.5 MB and fullSizeBytes shows the actual file size.",
  ].join(" "),
  input: getFileContentsInputSchema,
  handler: async ({ owner, repo, path, ref }) => ({
    file: await getFileContents(owner, repo, path, ref),
  }),
});

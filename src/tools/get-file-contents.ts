import { getFileContents } from "../github";
import { getFileContentsInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const getFileContentsTool = defineTool({
  name: "get_file_contents",
  description: "Get the contents of a file in a repository.",
  input: getFileContentsInputSchema,
  handler: async ({ owner, repo, path, ref }) => ({
    file: await getFileContents(owner, repo, path, ref),
  }),
});

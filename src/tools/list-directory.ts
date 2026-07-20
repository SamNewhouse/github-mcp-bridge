import { listDirectoryInputSchema } from "../lib/validation";
import { listDirectory } from "../github";
import { defineTool } from "./shared";

export const listDirectoryTool = defineTool({
  name: "list_directory",
  description: "List files and directories at a repository path.",
  input: listDirectoryInputSchema,
  handler: async ({ owner, repo, path, ref }) => ({
    entries: await listDirectory(owner, repo, path, ref),
  }),
});

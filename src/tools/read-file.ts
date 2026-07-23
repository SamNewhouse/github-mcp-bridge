import { getFileRaw } from "../github";
import { getFileRawInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const readFileTool = defineTool({
  name: "read_file",
  description: "Get the raw decoded text content of a file in a repository.",
  input: getFileRawInputSchema,
  handler: async ({ owner, repo, path, ref }) => ({
    content: await getFileRaw(owner, repo, path, ref),
  }),
});

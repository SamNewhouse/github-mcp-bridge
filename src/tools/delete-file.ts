import { deleteFileInputSchema } from "../lib/validation";
import { deleteFile } from "../github";
import { defineTool } from "./shared";

export const deleteFileTool = defineTool({
  name: "delete_file",
  description:
    "Delete a single file from a branch. Returns the deleted file path and commit details.",
  input: deleteFileInputSchema,
  handler: async ({ owner, repo, path, branch, message }) => ({
    result: await deleteFile(owner, repo, { path, branch, message }),
  }),
});

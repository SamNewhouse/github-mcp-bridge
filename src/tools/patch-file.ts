import { patchFileInputSchema } from "../lib/validation";
import { patchFile } from "../github";
import { defineTool } from "./shared";

export const patchFileTool = defineTool({
  name: "patch_file",
  description:
    "Apply targeted text patches to a file without replacing the entire content. " +
    "Supports replace_once, replace_all, insert_before, and insert_after operations. " +
    "Patches are applied in order. Binary files are rejected.",
  input: patchFileInputSchema,
  handler: async ({ owner, repo, path, branch, message, patches }) => ({
    result: await patchFile(owner, repo, { path, branch, message, patches }),
  }),
});

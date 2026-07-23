import { getRepository } from "../github";
import { getRepositoryInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const getRepositoryTool = defineTool({
  name: "get_repository",
  description: "Get details of a single repository.",
  input: getRepositoryInputSchema,
  handler: async ({ owner, repo }) => ({
    repository: await getRepository(owner, repo),
  }),
});

import { z } from "zod";
import { listRepositories } from "../github";
import { defineTool } from "./shared";

export const listRepositoriesTool = defineTool({
  name: "list_repositories",
  description: "List repositories accessible to the configured GitHub PAT.",
  input: z.object({}),
  handler: async () => ({
    repositories: await listRepositories(),
  }),
});

import {
  createBranchInputSchema,
  repositoryInputSchema,
  toolRequestSchema,
} from "./lib/validation";
import {
  createBranch,
  listBranches,
  listOpenPullRequests,
  listRepositories,
} from "./github";

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export const toolDefinitions = {
  list_repositories: {
    description: "List repositories accessible to the configured GitHub PAT.",
    inputSchema: schema({}),
    handler: async () => ({
      repositories: await listRepositories(),
    }),
  },
  list_branches: {
    description: "List branches for a repository.",
    inputSchema: schema(
      {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      ["owner", "repo"],
    ),
    handler: async (input: unknown) => {
      const parsed = repositoryInputSchema.parse(input);

      return {
        branches: await listBranches(parsed.owner, parsed.repo),
      };
    },
  },
  list_open_pull_requests: {
    description: "List open pull requests for a repository.",
    inputSchema: schema(
      {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      ["owner", "repo"],
    ),
    handler: async (input: unknown) => {
      const parsed = repositoryInputSchema.parse(input);

      return {
        pull_requests: await listOpenPullRequests(parsed.owner, parsed.repo),
      };
    },
  },
  create_branch: {
    description: "Create a branch from an existing base branch.",
    inputSchema: schema(
      {
        owner: { type: "string" },
        repo: { type: "string" },
        baseBranch: { type: "string" },
        newBranch: { type: "string" },
      },
      ["owner", "repo", "baseBranch", "newBranch"],
    ),
    handler: async (input: unknown) => {
      const parsed = createBranchInputSchema.parse(input);

      return {
        branch: await createBranch(
          parsed.owner,
          parsed.repo,
          parsed.baseBranch,
          parsed.newBranch,
        ),
      };
    },
  },
} as const;

export type ToolName = keyof typeof toolDefinitions;
export { toolRequestSchema };

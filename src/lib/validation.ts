import { z } from "zod";

export const repositoryInputSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

export const createBranchInputSchema = repositoryInputSchema.extend({
  baseBranch: z.string(),
  newBranch: z.string(),
});

export const toolRequestSchema = z.object({
  tool: z.string(),
  input: z.unknown().optional(),
});

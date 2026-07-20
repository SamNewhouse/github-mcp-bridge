import { z } from "zod";

export const ownerSchema = z.string().min(1, "owner is required");
export const repoSchema = z.string().min(1, "repo is required");
export const branchSchema = z.string().min(1, "branch is required");

export const repositoryInputSchema = z.object({
  owner: ownerSchema,
  repo: repoSchema,
});

export const createBranchInputSchema = z.object({
  owner: ownerSchema,
  repo: repoSchema,
  baseBranch: branchSchema,
  newBranch: branchSchema,
});

export const toolRequestSchema = z.object({
  tool: z.string().min(1),
  input: z.unknown().optional(),
});

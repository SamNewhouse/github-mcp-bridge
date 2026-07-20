import { z } from "zod";

export const repositoryInputSchema = z.object({
  owner: z.string().min(1, "owner is required"),
  repo: z.string().min(1, "repo is required"),
});

export const createBranchInputSchema = repositoryInputSchema.extend({
  baseBranch: z.string().min(1, "baseBranch is required"),
  newBranch: z.string().min(1, "newBranch is required"),
});

export const getFileContentsInputSchema = repositoryInputSchema.extend({
  path: z.string().min(1, "path is required"),
  ref: z.string().min(1).optional(),
});

export const getMultipleFilesInputSchema = repositoryInputSchema.extend({
  paths: z
    .array(z.string().min(1, "path is required"))
    .min(1, "at least one path is required"),
  ref: z.string().min(1).optional(),
});

export const listDirectoryInputSchema = repositoryInputSchema.extend({
  path: z.string().default(""),
  ref: z.string().min(1).optional(),
});

export const toolRequestSchema = z.object({
  tool: z.string(),
  input: z.unknown().optional(),
});

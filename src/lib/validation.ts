import { z } from "zod";

// GitHub owner and repo names: alphanumeric, hyphens, underscores, dots.
const githubNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "must only contain alphanumeric characters, hyphens, underscores, or dots",
  );

export const repositoryInputSchema = z.object({
  owner: githubNameSchema,
  repo: githubNameSchema,
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
  cursor: z.coerce.number().int().min(0).optional(),
  pageSize: z.coerce.number().int().min(1).max(20).optional(),
});

export const listDirectoryInputSchema = repositoryInputSchema.extend({
  path: z.string().default(""),
  ref: z.string().min(1).optional(),
});

export const pullRequestInputSchema = repositoryInputSchema.extend({
  pullNumber: z.coerce.number().int().positive(),
});

export const updatePullRequestInputSchema = pullRequestInputSchema.extend({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  base: z.string().min(1).optional(),
  state: z.enum(["open", "closed"]).optional(),
});

export const upsertFileInputSchema = repositoryInputSchema.extend({
  path: z.string().min(1, "path is required"),
  content: z.string(),
  message: z.string().min(1, "message is required"),
  branch: z.string().min(1, "branch is required"),
});

export const createPullRequestInputSchema = repositoryInputSchema.extend({
  title: z.string().min(1, "title is required"),
  body: z.string().optional(),
  head: z.string().min(1, "head is required"),
  base: z.string().min(1, "base is required"),
  draft: z.boolean().optional(),
});

export const toolRequestSchema = z.object({
  tool: z.string(),
  input: z.unknown().optional(),
});

// Issues
export const issueInputSchema = repositoryInputSchema.extend({
  issueNumber: z.coerce.number().int().positive(),
});

export const listIssuesInputSchema = repositoryInputSchema.extend({
  state: z.enum(["open", "closed", "all"]).default("open"),
});

export const createIssueInputSchema = repositoryInputSchema.extend({
  title: z.string().min(1, "title is required"),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export const updateIssueInputSchema = issueInputSchema.extend({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  state: z.enum(["open", "closed"]).optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export const linkIssueToPullRequestInputSchema = repositoryInputSchema.extend({
  pullNumber: z.coerce.number().int().positive(),
  issueNumber: z.coerce.number().int().positive(),
  keyword: z.enum(["closes", "fixes", "resolves"]).default("closes"),
});

export const issueCommentInputSchema = issueInputSchema.extend({
  body: z.string().min(1, "body is required"),
});

// Search
export const searchCodeInputSchema = repositoryInputSchema.extend({
  query: z.string().min(1, "query is required"),
});

export const searchFilesInputSchema = repositoryInputSchema.extend({
  pattern: z.string().min(1, "pattern is required"),
  ref: z.string().min(1).optional(),
});

// Commits
export const getCommitInputSchema = repositoryInputSchema.extend({
  ref: z.string().min(1, "ref (SHA or branch) is required"),
});

export const listCommitsInputSchema = repositoryInputSchema.extend({
  branch: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  perPage: z.coerce.number().int().positive().max(100).default(30),
});

// Branches
export const getBranchInputSchema = repositoryInputSchema.extend({
  branch: z.string().min(1, "branch is required"),
});

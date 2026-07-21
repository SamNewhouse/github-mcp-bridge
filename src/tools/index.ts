import { AppError } from "../lib/errors";
import { addIssueCommentTool } from "./add-issue-comment";
import { createBranchTool } from "./create-branch";
import { createIssueTool } from "./create-issue";
import { createPullRequestTool } from "./create-pull-request";
import { getBranchTool } from "./get-branch";
import { getCommitTool } from "./get-commit";
import { getFileContentsTool } from "./get-file-contents";
import { getIssueTool } from "./get-issue";
import { getMultipleFilesTool } from "./get-multiple-files";
import { getPullRequestDiffTool } from "./get-pull-request-diff";
import { getPullRequestTool } from "./get-pull-request";
import { linkIssueToPullRequestTool } from "./link-issue-to-pull-request";
import { listBranchesTool } from "./list-branches";
import { listCommitsTool } from "./list-commits";
import { listDirectoryTool } from "./list-directory";
import { listIssueCommentsTool } from "./list-issue-comments";
import { listIssuesTool } from "./list-issues";
import { listOpenPullRequestsTool } from "./list-open-pull-requests";
import { listPullRequestCommentsTool } from "./list-pull-request-comments";
import { listPullRequestFilesTool } from "./list-pull-request-files";
import { listRepositoriesTool } from "./list-repositories";
import { searchCodeTool } from "./search-code";
import { searchFilesTool } from "./search-files";
import { updateIssueTool } from "./update-issue";
import { updatePullRequestTool } from "./update-pull-request";
import { upsertFileTool } from "./upsert-file";

const tools = [
  listRepositoriesTool,
  listBranchesTool,
  listOpenPullRequestsTool,
  createBranchTool,
  getFileContentsTool,
  getMultipleFilesTool,
  listDirectoryTool,
  getPullRequestTool,
  listPullRequestFilesTool,
  listPullRequestCommentsTool,
  updatePullRequestTool,
  upsertFileTool,
  createPullRequestTool,
  getPullRequestDiffTool,
  listIssuesTool,
  getIssueTool,
  createIssueTool,
  updateIssueTool,
  linkIssueToPullRequestTool,
  searchCodeTool,
  searchFilesTool,
  getCommitTool,
  listCommitsTool,
  getBranchTool,
  listIssueCommentsTool,
  addIssueCommentTool,
] as const;

export const toolDefinitions = Object.fromEntries(
  tools.map((tool) => [tool.name, tool]),
) as Record<(typeof tools)[number]["name"], (typeof tools)[number]>;

export type ToolName = keyof typeof toolDefinitions;

export function getToolList() {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export async function executeTool(name: string, input: unknown) {
  if (!Object.hasOwn(toolDefinitions, name)) {
    throw new AppError("Unknown or missing tool", 400);
  }

  const tool = toolDefinitions[name as ToolName];
  return tool.run(input);
}

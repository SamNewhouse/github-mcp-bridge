import { z } from "zod";
import { AppError } from "../lib/errors";
import { createBranchTool } from "./create-branch";
import { getFileContentsTool } from "./get-file-contents";
import { listBranchesTool } from "./list-branches";
import { listOpenPullRequestsTool } from "./list-open-pull-requests";
import { listRepositoriesTool } from "./list-repositories";
import { getMultipleFilesTool } from "./get-multiple-files";

const tools = [
  listRepositoriesTool,
  listBranchesTool,
  listOpenPullRequestsTool,
  createBranchTool,
  getFileContentsTool,
  getMultipleFilesTool,
] as const;

export const toolDefinitions = Object.fromEntries(
  tools.map((tool) => [tool.name, tool]),
) as Record<(typeof tools)[number]["name"], (typeof tools)[number]>;

export type ToolName = keyof typeof toolDefinitions;

export const toolRequestSchema = z.object({
  tool: z.string(),
  input: z.unknown().optional(),
});

export function getToolList() {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export async function executeTool(name: string, input: unknown) {
  const tool = toolDefinitions[name as ToolName];

  if (!tool) {
    throw new AppError("Unknown or missing tool", 400);
  }

  return tool.run(input);
}

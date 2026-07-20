import { toolDefinitions, ToolName } from "../tools";

export async function executeTool(name: ToolName, input: unknown) {
  const tool = toolDefinitions[name];

  if (!tool) {
    throw new Error("Unknown tool");
  }

  const parsed = tool.parse(input);
  return tool.handler(parsed);
}

import type { AgentTool, McpAgentClient } from "./client";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
};

export type ToolCallRequest = {
  tool: string;
  arguments?: Record<string, unknown>;
};

export type LlmTurnResult =
  | {
      type: "message";
      message: string;
    }
  | {
      type: "tool_call";
      call: ToolCallRequest;
    };

export type LlmRunner = (input: {
  messages: ChatMessage[];
  tools: AgentTool[];
}) => Promise<LlmTurnResult>;

export type RunAgentLoopOptions = {
  client: McpAgentClient;
  llm: LlmRunner;
  systemPrompt?: string;
  userPrompt: string;
  maxSteps?: number;
};

export async function runAgentLoop(
  options: RunAgentLoopOptions,
): Promise<string> {
  const tools = await options.client.listTools();

  const messages: ChatMessage[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: options.userPrompt });

  const maxSteps = options.maxSteps ?? 8;

  for (let step = 0; step < maxSteps; step += 1) {
    const turn = await options.llm({
      messages,
      tools,
    });

    if (turn.type === "message") {
      messages.push({ role: "assistant", content: turn.message });
      return turn.message;
    }

    const toolName = turn.call.tool;
    const toolArgs = turn.call.arguments ?? {};
    const toolResult = await options.client.callTool(toolName, toolArgs);

    messages.push({
      role: "assistant",
      content: `Calling tool: ${toolName}`,
    });

    messages.push({
      role: "tool",
      toolName,
      content: toolResult,
    });
  }

  throw new Error(
    "Agent loop exceeded maxSteps without producing a final response.",
  );
}

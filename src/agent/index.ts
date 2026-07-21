import { McpAgentClient } from "./client";
import { runAgentLoop, type LlmRunner } from "./llm-loop";

async function main() {
   const serverUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3000/";
  const apiKey = process.env.CONNECTOR_SECRET;
  const userPrompt =
    process.argv.slice(2).join(" ").trim() ||
    process.env.AGENT_PROMPT?.trim() ||
    "List the available MCP tools and explain what each one does.";

  if (!userPrompt) {
    throw new Error("Provide a prompt as CLI arguments.");
  }

  const client = new McpAgentClient({
    serverUrl,
    apiKey,
  });

  await client.connect();

  const llm: LlmRunner = async ({ messages, tools }) => {
    const latestUserMessage =
      [...messages].reverse().find((message) => message.role === "user")
        ?.content ?? "";

    return {
      type: "message",
      message: [
        "Agent is connected to the MCP bridge.",
        `Available tools: ${tools.map((tool) => tool.name).join(", ") || "none"}.`,
        `Stub response for prompt: ${latestUserMessage}`,
      ].join("\n"),
    };
  };

  try {
    const result = await runAgentLoop({
      client,
      llm,
      systemPrompt:
        "You are a GitHub agent that uses MCP tools when necessary to inspect and modify repositories.",
      userPrompt,
    });

    console.log(result);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

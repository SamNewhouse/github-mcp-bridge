import "dotenv/config";
import { McpAgentClient } from "./client";

async function main() {
  const client = new McpAgentClient(
    process.env.MCP_SERVER_URL ?? "http://localhost:3000/",
    process.env.CONNECTOR_SECRET,
  );

  await client.connect();

  const tools = await client.listTools();
  console.log(tools);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpAgentClientOptions = {
  serverUrl: string;
  apiKey?: string;
  serverName?: string;
  serverVersion?: string;
};

export type AgentTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

type ToolContentBlock =
  | { type: "text"; text: string }
  | Record<string, unknown>;

export class McpAgentClient {
  private readonly client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private readonly serverUrl: string;
  private readonly apiKey?: string;

  constructor(options: McpAgentClientOptions) {
    this.serverUrl = options.serverUrl;
    this.apiKey = options.apiKey;

    this.client = new Client({
      name: options.serverName ?? "github-mcp-bridge-agent",
      version: options.serverVersion ?? "1.0.0",
    });
  }

  async connect(): Promise<void> {
    if (this.transport) return;

    const authFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers ?? {});

      if (this.apiKey) {
        headers.set("authorization", `Bearer ${this.apiKey}`);
      }

      headers.set("accept", "application/json, text/event-stream");

      return fetch(input, {
        ...init,
        headers,
      });
    };

    this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {
      fetch: authFetch,
    });

    await this.client.connect(this.transport);
  }

  async close(): Promise<void> {
    await this.client.close();
    this.transport = null;
  }

  async listTools(): Promise<AgentTool[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<string> {
    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    const content: ToolContentBlock[] = Array.isArray(result.content)
      ? (result.content as ToolContentBlock[])
      : [];

    return content
      .map((item) =>
        item.type === "text" && typeof item.text === "string"
          ? item.text
          : JSON.stringify(item),
      )
      .join("\n");
  }
}

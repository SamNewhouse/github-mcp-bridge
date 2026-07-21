export type AgentTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

type JsonRpcResponse<T> =
  | { result: T }
  | { error: { code: number; message: string; data?: unknown } };

export class McpAgentClient {
  private id = 1;
  private initialized = false;

  constructor(
    private readonly serverUrl: string,
    private readonly apiKey?: string,
  ) {}

  private get headers(): HeadersInit {
    return {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  private async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.id++,
        method,
        params,
      }),
    });

    const json = (await response.json()) as JsonRpcResponse<T>;

    if ("error" in json) {
      throw new Error(
        `MCP error ${json.error.code}: ${json.error.message}${
          json.error.data ? ` ${JSON.stringify(json.error.data)}` : ""
        }`,
      );
    }

    return json.result;
  }

  async connect(): Promise<void> {
    if (this.initialized) return;

    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "github-mcp-bridge-agent",
        version: "1.0.0",
      },
    });

    await fetch(this.serverUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    this.initialized = true;
  }

  async listTools(): Promise<AgentTool[]> {
    const result = await this.request<{ tools: AgentTool[] }>("tools/list");
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.request("tools/call", {
      name,
      arguments: args,
    });
  }
}

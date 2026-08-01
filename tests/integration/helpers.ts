export const BASE_URL = `http://localhost:${process.env.PORT ?? "3000"}`;
export const SECRET = process.env.CONNECTOR_SECRET!;
export const OWNER = "SamNewhouse";
export const REPO = "github-mcp-bridge";

let sessionId: string | null = null;
let nextId = 1;

function jsonRpcId() {
  return nextId++;
}

type JsonRpcBody = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
};

async function postJsonRpc(
  body: JsonRpcBody,
  options: { sessionId?: string } = {},
) {
  return fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
      ...(options.sessionId ? { "Mcp-Session-Id": options.sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function initializeSession() {
  if (sessionId) return sessionId;

  const initRes = await postJsonRpc({
    jsonrpc: "2.0",
    id: jsonRpcId(),
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "jest-integration",
        version: "1.0.0",
      },
    },
  });

  const newSessionId = initRes.headers.get("mcp-session-id");

  if (!initRes.ok || !newSessionId) {
    throw new Error(
      `Failed to initialize MCP session: ${initRes.status} ${await initRes.text()}`,
    );
  }

  const initializedRes = await postJsonRpc(
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    },
    { sessionId: newSessionId },
  );

  if (initializedRes.status !== 202) {
    throw new Error(
      `Expected notifications/initialized to return 202, got ${initializedRes.status}`,
    );
  }

  sessionId = newSessionId;
  return sessionId;
}

export function resetSession() {
  sessionId = null;
  nextId = 1;
}

export async function postSessionJsonRpc(body: JsonRpcBody) {
  const activeSessionId = await initializeSession();
  return postJsonRpc(body, { sessionId: activeSessionId });
}

export async function callTool(name: string, input: Record<string, unknown>) {
  const res = await postSessionJsonRpc({
    jsonrpc: "2.0",
    id: jsonRpcId(),
    method: "tools/call",
    params: { name, arguments: input },
  });

  const json = await res.json();
  if (json.error) throw new Error(`Tool error: ${JSON.stringify(json.error)}`);
  return JSON.parse(json.result.content[0].text);
}

export async function callToolRaw(
  name: string,
  input: Record<string, unknown>,
) {
  const res = await postSessionJsonRpc({
    jsonrpc: "2.0",
    id: jsonRpcId(),
    method: "tools/call",
    params: { name, arguments: input },
  });

  return res.json();
}

export const BASE_URL = `http://localhost:${process.env.PORT ?? "3000"}`;
export const SECRET = process.env.CONNECTOR_SECRET!;
export const OWNER = "SamNewhouse";
export const REPO = "github-mcp-bridge";

export async function callTool(name: string, input: Record<string, unknown>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: input },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Tool error: ${JSON.stringify(json.error)}`);
  return JSON.parse(json.result.content[0].text);
}

export async function callToolRaw(name: string, input: Record<string, unknown>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: input },
    }),
  });
  return res.json();
}

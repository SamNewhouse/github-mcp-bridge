import type { McpToolResult } from "../tools/shared";

export const RPC_UNAUTHORIZED = -32001;
export const RPC_SESSION_REQUIRED = -32002;
export const SUPPORTED_PROTOCOL_VERSION = "2025-03-26";

export function isMcpToolResult(value: unknown): value is McpToolResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (!Array.isArray(candidate.content)) {
    return false;
  }

  return candidate.content.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const contentItem = item as Record<string, unknown>;

    return contentItem.type === "text" && typeof contentItem.text === "string";
  });
}

export function toMcpToolResult(result: unknown): McpToolResult {
  if (isMcpToolResult(result)) {
    return result;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

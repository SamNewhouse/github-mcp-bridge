import { z } from "zod";
import { AppError } from "../lib/errors";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

export type ToolResult = unknown;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: unknown) => Promise<ToolResult>;
};

export function defineTool<TSchema extends z.ZodTypeAny>(config: {
  name: string;
  description: string;
  input: TSchema;
  handler: (input: z.infer<TSchema>) => Promise<ToolResult>;
}): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: z.toJSONSchema(config.input) as Record<string, unknown>,
    run: async (input: unknown) => {
      // Validate input is an object
      if (!input || typeof input !== "object") {
        throw new AppError(
          "Tool arguments must be an object. All tools (except list_repositories) require both 'owner' and 'repo' parameters.",
          400,
        );
      }

      // Check for required repository parameters before parsing
      const args = input as Record<string, unknown>;
      const hasOwner = "owner" in args;
      const hasRepo = "repo" in args;

      if (!hasOwner || !hasRepo) {
        const missing = [];
        if (!hasOwner) missing.push("'owner'");
        if (!hasRepo) missing.push("'repo'");

        throw new AppError(
          `Missing required parameters: ${missing.join(" and ")}. ` +
            "All tools (except list_repositories) require both 'owner' and 'repo' parameters. " +
            "Example: {\"owner\": \"SamNewhouse\", \"repo\": \"github-mcp-bridge\"}",
          400,
        );
      }

      const parsed = config.input.parse(input);
      return config.handler(parsed);
    },
  };
}

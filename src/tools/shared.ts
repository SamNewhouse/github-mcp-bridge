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
      if (!input || typeof input !== "object") {
        throw new AppError("Tool arguments must be an object.", 400);
      }

      const parsed = config.input.safeParse(input);
      if (!parsed.success) {
        throw new AppError("Invalid tool arguments", 400, {
          cause: parsed.error,
        });
      }

      return config.handler(parsed.data);
    },
  };
}

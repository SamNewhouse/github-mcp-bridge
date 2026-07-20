import { z } from "zod";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: unknown) => Promise<unknown>;
};

export function defineTool<TSchema extends z.ZodTypeAny>(config: {
  name: string;
  description: string;
  input: TSchema;
  handler: (input: z.infer<TSchema>) => Promise<unknown>;
}): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: z.toJSONSchema(config.input) as Record<string, unknown>,
    run: async (input: unknown) => {
      const parsed = config.input.parse(input);
      return config.handler(parsed);
    },
  };
}

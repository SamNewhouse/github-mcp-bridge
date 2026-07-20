import { z } from "zod";

export type ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  parse: (input: unknown) => z.infer<TSchema>;
  handler: (input: z.infer<TSchema>) => Promise<unknown>;
};

export function defineTool<TSchema extends z.ZodTypeAny>(config: {
  name: string;
  description: string;
  input: TSchema;
  handler: (input: z.infer<TSchema>) => Promise<unknown>;
}): ToolDefinition<TSchema> {
  return {
    name: config.name,
    description: config.description,
    inputSchema: z.toJSONSchema(config.input) as Record<string, unknown>,
    parse: (input: unknown) => config.input.parse(input),
    handler: config.handler,
  };
}

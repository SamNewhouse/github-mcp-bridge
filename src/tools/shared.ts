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

function formatZodIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "input";
    return `${path}: ${issue.message}`;
  });
  
  // Check if owner or repo are missing/invalid
  const hasOwnerIssue = issues.some(i => 
    i.includes('owner') && (i.includes('undefined') || i.includes('Invalid input'))
  );
  const hasRepoIssue = issues.some(i => 
    i.includes('repo') && (i.includes('undefined') || i.includes('Invalid input') || i.includes('must only contain'))
  );
  
  if (hasOwnerIssue || hasRepoIssue) {
    issues.push(
      "\n\nHINT: GitHub repository tools require 'owner' and 'repo' parameters. " +
      "Ask the user which repository to work with, then retry with: " +
      "{ owner: 'GitHubOwner', repo: 'repository-name' }. " +
      "Example: { owner: 'SamNewhouse', repo: 'github-mcp-bridge' }"
    );
  }
  
  return issues.join("; ");
}

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
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new AppError("Tool arguments must be an object.", 400);
      }

      const parsed = config.input.safeParse(input);
      if (!parsed.success) {
        throw new AppError(
          `Invalid tool arguments: ${formatZodIssues(parsed.error)}`,
          400,
          {
            cause: parsed.error,
          },
        );
      }

      try {
        return await config.handler(parsed.data);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        if (error instanceof Error) {
          throw new AppError(error.message, 500, {
            cause: error,
          });
        }

        throw new AppError(`Tool "${config.name}" failed.`, 500, {
          cause: error,
        });
      }
    },
  };
}

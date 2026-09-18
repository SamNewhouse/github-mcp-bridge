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

/**
 * Formats Zod validation issues into a readable error message.
 *
 * For repository-related validation failures, an actionable hint is appended
 * explaining that both `owner` and `repo` are required.
 *
 * @param error - The Zod validation error.
 * @returns A semicolon-separated validation message.
 */
function formatZodIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "input";

    return `${path}: ${issue.message}`;
  });

  const hasOwnerIssue = issues.some(
    (issue) =>
      issue.includes("owner") &&
      (issue.includes("undefined") || issue.includes("Invalid input")),
  );

  const hasRepoIssue = issues.some(
    (issue) =>
      issue.includes("repo") &&
      (issue.includes("undefined") ||
        issue.includes("Invalid input") ||
        issue.includes("must only contain")),
  );

  if (hasOwnerIssue || hasRepoIssue) {
    issues.push(
      "\n\nHINT: GitHub repository tools require 'owner' and 'repo' parameters. " +
        "Ask the user which repository to work with, then retry with: " +
        "{ owner: 'GitHubOwner', repo: 'repository-name' }. " +
        "Example: { owner: 'SamNewhouse', repo: 'github-mcp-bridge' }",
    );
  }

  return issues.join("; ");
}

/**
 * Creates a validated tool definition.
 *
 * The returned tool converts the supplied Zod schema into JSON Schema,
 * rejects non-object arguments, validates the input, and normalizes handler
 * failures into `AppError` instances.
 *
 * @typeParam TSchema - The Zod schema used to validate tool arguments.
 * @param config - The tool name, description, input schema, and handler.
 * @returns A normalized tool definition.
 */
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

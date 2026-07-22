import { getWorkflowRun } from "../github";
import { getWorkflowRunInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const getWorkflowRunTool = defineTool({
  name: "get_workflow_run",
  description:
    "Get details of a workflow run, including its jobs and steps.",
  input: getWorkflowRunInputSchema,
  handler: async ({ owner, repo, runId }) => ({
    workflow_run: await getWorkflowRun(owner, repo, runId),
  }),
});

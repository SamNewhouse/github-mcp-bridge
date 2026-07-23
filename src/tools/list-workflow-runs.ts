import { listWorkflowRuns } from "../github";
import { listWorkflowRunsInputSchema } from "../lib/validation";
import { defineTool } from "./shared";

export const listWorkflowRunsTool = defineTool({
  name: "list_workflow_runs",
  description:
    "List workflow runs for a repository. Optionally filter by branch, event, or status.",
  input: listWorkflowRunsInputSchema,
  handler: async ({ owner, repo, branch, event, status, perPage }) => ({
    workflow_runs: await listWorkflowRuns(
      owner,
      repo,
      branch,
      event,
      status,
      perPage,
    ),
  }),
});

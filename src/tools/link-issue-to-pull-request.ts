import { linkIssueToPullRequestInputSchema } from "../lib/validation";
import { linkIssueToPullRequest } from "../github";
import { defineTool } from "./shared";

export const linkIssueToPullRequestTool = defineTool({
  name: "link_issue_to_pull_request",
  description:
    "Links an issue to a pull request by appending a closing keyword (closes/fixes/resolves) and the issue number to the PR body. GitHub will automatically close the issue when the PR is merged.",
  input: linkIssueToPullRequestInputSchema,
  handler: async ({ owner, repo, pullNumber, issueNumber, keyword }) => ({
    result: await linkIssueToPullRequest(owner, repo, pullNumber, issueNumber, keyword),
  }),
});

import { getPullRequestReviewsInputSchema } from "../lib/validation";
import { getPullRequestReviews } from "../github";
import { defineTool } from "./shared";

export const getPullRequestReviewsTool = defineTool({
  name: "get_pull_request_reviews",
  description: "List reviews submitted on a pull request.",
  input: getPullRequestReviewsInputSchema,
  handler: async ({ owner, repo, pullNumber }) => ({
    reviews: await getPullRequestReviews(owner, repo, pullNumber),
  }),
});

import { AppError } from "../lib/errors";

/**
 * Maps a GitHub HTTP status and response body to an application error.
 *
 * @param status - The HTTP status returned by GitHub.
 * @param body - The response body returned by GitHub.
 * @param patKey - The environment variable name used for authentication.
 * @returns The corresponding application error.
 */
export function mapGithubStatus(
  status: number,
  body: string,
  patKey: string,
): AppError {
  switch (status) {
    case 401:
      return new AppError(
        `GitHub authentication failed — check ${patKey}`,
        401,
      );

    case 403:
      if (body.includes("rate limit") || body.includes("API rate limit")) {
        return new AppError("GitHub rate limit exceeded — retry later", 429);
      }

      return new AppError(
        "GitHub request forbidden — insufficient PAT scopes",
        403,
      );

    case 404:
      return new AppError("GitHub resource not found", 404);

    case 409:
      return new AppError(
        "GitHub conflict — resource already exists or is out of date",
        409,
      );

    case 422:
      return new AppError(`GitHub validation error: ${body}`, 422);

    case 429:
      return new AppError("GitHub rate limit exceeded — retry later", 429);

    default:
      return new AppError(
        `GitHub API error (${status}): ${body || "unknown error"}`,
        status,
      );
  }
}

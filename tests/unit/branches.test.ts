jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  listBranches,
  createBranch,
  getBranch,
} from "../../src/github/branches";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

// ---------------------------------------------------------------------------
// createBranch
// ---------------------------------------------------------------------------
describe("createBranch", () => {
  /**
   * Happy path — base branch exists; asserts the new branch name and
   * the base branch's SHA are returned, and that two API calls are made:
   * one GET to resolve the base SHA, one POST to create the ref.
   */
  it("returns the new branch name and SHA from the base branch", async () => {
    mock
      .mockResolvedValueOnce({ name: "main", commit: { sha: "abc123" }, protected: false })
      .mockResolvedValueOnce({});

    const result = await createBranch("owner", "repo", "main", "feat/new");

    expect(result.name).toBe("feat/new");
    expect(result.sha).toBe("abc123");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  /**
   * Correct ref format — the POST body must include the full refs/heads/ prefix.
   * Asserts the body sent to the git/refs endpoint is correctly formed.
   */
  it("sends refs/heads/<name> format in the POST body", async () => {
    mock
      .mockResolvedValueOnce({ name: "main", commit: { sha: "sha1" }, protected: false })
      .mockResolvedValueOnce({});

    await createBranch("owner", "repo", "main", "feat/my-feature");

    const [, options] = (mock as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    expect(body.ref).toBe("refs/heads/feat/my-feature");
    expect(body.sha).toBe("sha1");
  });
});

// ---------------------------------------------------------------------------
// getBranch
// ---------------------------------------------------------------------------
describe("getBranch", () => {
  /**
   * Happy path — returns structured detail including latest_commit.
   * Asserts all fields are correctly extracted from the nested GitHub response.
   */
  it("returns branch detail with latest_commit fields", async () => {
    mock.mockResolvedValueOnce({
      name: "main",
      commit: {
        sha: "abc123",
        html_url: "https://github.com/commit/abc123",
        commit: {
          message: "Initial commit",
          author: { name: "Alice", date: "2026-01-01T00:00:00Z" },
        },
      },
      protected: true,
    });

    const result = await getBranch("owner", "repo", "main");

    expect(result.name).toBe("main");
    expect(result.sha).toBe("abc123");
    expect(result.protected).toBe(true);
    expect(result.latest_commit.message).toBe("Initial commit");
    expect(result.latest_commit.author).toBe("Alice");
    expect(result.latest_commit.date).toBe("2026-01-01T00:00:00Z");
  });
});

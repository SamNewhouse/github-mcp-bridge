jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import { listBranches, createBranch, getBranch } from "../../src/github/branches";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

// ---------------------------------------------------------------------------
// listBranches
// ---------------------------------------------------------------------------
describe("listBranches", () => {
  /**
   * Return shape — verifies each branch is mapped to name, sha, and protected.
   * The sha comes from the nested commit.sha field in the GitHub response.
   */
  it("maps name, sha, and protected for each branch", async () => {
    mock.mockResolvedValueOnce([
      { name: "main", commit: { sha: "abc123" }, protected: true },
      { name: "feat/foo", commit: { sha: "def456" }, protected: false },
    ]);

    const result = await listBranches("owner", "repo");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "main", sha: "abc123", protected: true });
    expect(result[1]).toEqual({ name: "feat/foo", sha: "def456", protected: false });
  });

  /**
   * URL contains per_page=100 — asserts the request fetches up to 100
   * branches in one call rather than using a smaller default page size.
   */
  it("requests up to 100 branches per page", async () => {
    mock.mockResolvedValueOnce([]);

    await listBranches("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
  });

  /**
   * Empty list — repo has no branches (edge case).
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array when there are no branches", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await listBranches("owner", "repo");

    expect(result).toEqual([]);
  });
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
   * Asserts all fields are correctly extracted from the nested GitHub response,
   * including html_url from the commit object.
   */
  it("returns branch detail with latest_commit fields including html_url", async () => {
    mock.mockResolvedValueOnce({
      name: "main",
      commit: {
        sha: "abc123",
        html_url: "https://github.com/owner/repo/commit/abc123",
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
    expect(result.latest_commit.html_url).toBe("https://github.com/owner/repo/commit/abc123");
  });
});

// =============================================================================
// MUTATION TOOL UNIT TESTS
// =============================================================================
// All mutation tools are covered here with jest.mock() — no real network calls
// are ever made. The jest project config for "unit" does NOT provide a
// GITHUB_PAT or CONNECTOR_SECRET env var, so any test that accidentally imports
// githubRequest without mocking it will throw at PAT-resolution time, giving an
// immediate, obvious failure.
//
// Covered tools:
//   create_branch, upsert_file, patch_file, delete_file,
//   create_pull_request, update_pull_request,
//   create_issue, update_issue, add_issue_comment, link_issue_to_pull_request
// =============================================================================

// ---------------------------------------------------------------------------
// Network safeguard — must be declared before any src/ imports
// ---------------------------------------------------------------------------
jest.mock("node:https");
jest.mock("node:http");

// Mock the low-level GitHub client so nothing ever hits the wire
jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

// Mock config so PAT lookup never throws
jest.mock("../../src/config", () => ({
  getGithubPat: jest.fn().mockReturnValue("mock-pat"),
  getConnectorSecret: jest.fn().mockReturnValue("mock-secret"),
}));

import { githubRequest } from "../../src/github/client";
import { executeTool } from "../../src/tools/index";

const mockGithubRequest = githubRequest as jest.MockedFunction<typeof githubRequest>;

// Reset mocks between each test to keep them isolated
beforeEach(() => {
  mockGithubRequest.mockReset();
});

// ---------------------------------------------------------------------------
// create_branch
// ---------------------------------------------------------------------------
describe("create_branch (unit)", () => {
  it("calls the correct GitHub endpoint and returns the mapped branch", async () => {
    mockGithubRequest
      .mockResolvedValueOnce({ object: { sha: "abc123" } }) // get ref for baseBranch
      .mockResolvedValueOnce({ ref: "refs/heads/test/new-branch", object: { sha: "abc123" } }); // create ref

    const result = await executeTool("create_branch", {
      owner: "owner",
      repo: "repo",
      baseBranch: "main",
      newBranch: "test/new-branch",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty("branch");
  });

  it("rejects when newBranch is missing", async () => {
    await expect(
      executeTool("create_branch", { owner: "owner", repo: "repo", baseBranch: "main" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects when baseBranch is missing", async () => {
    await expect(
      executeTool("create_branch", { owner: "owner", repo: "repo", newBranch: "test/x" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// upsert_file
// ---------------------------------------------------------------------------
describe("upsert_file (unit)", () => {
  it("creates a file when it does not exist yet (no existing SHA)", async () => {
    mockGithubRequest
      .mockRejectedValueOnce(Object.assign(new Error("not found"), { statusCode: 404 })) // get existing file
      .mockResolvedValueOnce({ content: { sha: "newsha", path: "hello.txt" }, commit: { sha: "commitsha" } });

    const result = await executeTool("upsert_file", {
      owner: "owner",
      repo: "repo",
      path: "hello.txt",
      content: "Hello world",
      message: "add file",
      branch: "main",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty("file");
  });

  it("rejects when content field is missing", async () => {
    await expect(
      executeTool("upsert_file", { owner: "owner", repo: "repo", path: "f.txt", message: "m", branch: "main" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects when branch field is missing", async () => {
    await expect(
      executeTool("upsert_file", { owner: "owner", repo: "repo", path: "f.txt", content: "x", message: "m" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patch_file
// ---------------------------------------------------------------------------
describe("patch_file (unit)", () => {
  const BASE64_CONTENT = Buffer.from("line1\nfoo bar\nline3").toString("base64");

  it("applies a replace_once patch and writes the result back", async () => {
    mockGithubRequest
      .mockResolvedValueOnce({ content: BASE64_CONTENT, sha: "filesha", encoding: "base64" }) // get file
      .mockResolvedValueOnce({ content: { sha: "newsha" }, commit: { sha: "commitsha" } }); // put file

    const result = await executeTool("patch_file", {
      owner: "owner",
      repo: "repo",
      path: "file.txt",
      branch: "main",
      message: "patch",
      patches: [{ op: "replace_once", find: "foo bar", replace: "baz qux" }],
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty("file");
  });

  it("rejects when patches array is empty", async () => {
    await expect(
      executeTool("patch_file", { owner: "owner", repo: "repo", path: "f.txt", branch: "main", message: "m", patches: [] })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects when patches field is missing", async () => {
    await expect(
      executeTool("patch_file", { owner: "owner", repo: "repo", path: "f.txt", branch: "main", message: "m" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects an invalid patch op", async () => {
    await expect(
      executeTool("patch_file", {
        owner: "owner", repo: "repo", path: "f.txt", branch: "main", message: "m",
        patches: [{ op: "invalid_op", find: "x", replace: "y" }],
      })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------
describe("delete_file (unit)", () => {
  it("calls the delete endpoint with the resolved file SHA", async () => {
    mockGithubRequest
      .mockResolvedValueOnce({ sha: "filesha" }) // get file to resolve SHA
      .mockResolvedValueOnce({ commit: { sha: "commitsha" } }); // delete

    const result = await executeTool("delete_file", {
      owner: "owner",
      repo: "repo",
      path: "old.txt",
      branch: "main",
      message: "remove file",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty("commit");
  });

  it("rejects when path is missing", async () => {
    await expect(
      executeTool("delete_file", { owner: "owner", repo: "repo", branch: "main", message: "m" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects when branch is missing", async () => {
    await expect(
      executeTool("delete_file", { owner: "owner", repo: "repo", path: "f.txt", message: "m" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects when message is missing", async () => {
    await expect(
      executeTool("delete_file", { owner: "owner", repo: "repo", path: "f.txt", branch: "main" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// create_pull_request
// ---------------------------------------------------------------------------
describe("create_pull_request (unit)", () => {
  it("creates a PR and returns mapped fields", async () => {
    mockGithubRequest.mockResolvedValueOnce({
      number: 42,
      title: "My PR",
      html_url: "https://github.com/owner/repo/pull/42",
      state: "open",
      draft: false,
      body: "",
      head: { ref: "feature", sha: "abc" },
      base: { ref: "main" },
      user: { login: "sam" },
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      merged_at: null,
    });

    const result = await executeTool("create_pull_request", {
      owner: "owner",
      repo: "repo",
      title: "My PR",
      head: "feature",
      base: "main",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("pullRequest");
    expect(result.pullRequest.number).toBe(42);
  });

  it("rejects when title is missing", async () => {
    await expect(
      executeTool("create_pull_request", { owner: "owner", repo: "repo", head: "feat", base: "main" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update_pull_request
// ---------------------------------------------------------------------------
describe("update_pull_request (unit)", () => {
  it("updates PR title and returns mapped fields", async () => {
    mockGithubRequest.mockResolvedValueOnce({
      number: 1,
      title: "Updated title",
      html_url: "https://github.com/owner/repo/pull/1",
      state: "open",
      draft: false,
      body: "",
      head: { ref: "feat", sha: "abc" },
      base: { ref: "main" },
      user: { login: "sam" },
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      merged_at: null,
    });

    const result = await executeTool("update_pull_request", {
      owner: "owner",
      repo: "repo",
      pullNumber: 1,
      title: "Updated title",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
    expect(result.pullRequest.title).toBe("Updated title");
  });

  it("rejects when no update fields are provided", async () => {
    await expect(
      executeTool("update_pull_request", { owner: "owner", repo: "repo", pullNumber: 1 })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects an invalid state value", async () => {
    await expect(
      executeTool("update_pull_request", { owner: "owner", repo: "repo", pullNumber: 1, state: "merged" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// create_issue
// ---------------------------------------------------------------------------
describe("create_issue (unit)", () => {
  it("creates an issue and returns mapped fields", async () => {
    mockGithubRequest.mockResolvedValueOnce({
      number: 5,
      title: "Bug report",
      html_url: "https://github.com/owner/repo/issues/5",
      state: "open",
      body: "desc",
      user: { login: "sam" },
      labels: [],
      assignees: [],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    const result = await executeTool("create_issue", {
      owner: "owner",
      repo: "repo",
      title: "Bug report",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("issue");
    expect(result.issue.number).toBe(5);
  });

  it("rejects when title is missing", async () => {
    await expect(
      executeTool("create_issue", { owner: "owner", repo: "repo" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update_issue
// ---------------------------------------------------------------------------
describe("update_issue (unit)", () => {
  it("updates issue state to closed", async () => {
    mockGithubRequest.mockResolvedValueOnce({
      number: 3,
      title: "Old title",
      html_url: "https://github.com/owner/repo/issues/3",
      state: "closed",
      body: "",
      user: { login: "sam" },
      labels: [],
      assignees: [],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    });

    const result = await executeTool("update_issue", {
      owner: "owner",
      repo: "repo",
      issueNumber: 3,
      state: "closed",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
    expect(result.issue.state).toBe("closed");
  });

  it("rejects when no update fields are provided", async () => {
    await expect(
      executeTool("update_issue", { owner: "owner", repo: "repo", issueNumber: 3 })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("rejects an invalid state value", async () => {
    await expect(
      executeTool("update_issue", { owner: "owner", repo: "repo", issueNumber: 1, state: "merged" })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// add_issue_comment
// ---------------------------------------------------------------------------
describe("add_issue_comment (unit)", () => {
  it("posts a comment and returns mapped fields", async () => {
    mockGithubRequest.mockResolvedValueOnce({
      id: 99,
      body: "Great issue!",
      user: { login: "sam" },
      html_url: "https://github.com/owner/repo/issues/2#issuecomment-99",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });

    const result = await executeTool("add_issue_comment", {
      owner: "owner",
      repo: "repo",
      issueNumber: 2,
      body: "Great issue!",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("comment");
    expect(result.comment.id).toBe(99);
  });

  it("rejects when body is missing", async () => {
    await expect(
      executeTool("add_issue_comment", { owner: "owner", repo: "repo", issueNumber: 2 })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// link_issue_to_pull_request
// ---------------------------------------------------------------------------
describe("link_issue_to_pull_request (unit)", () => {
  it("appends a closing keyword to the PR body and returns updated PR fields", async () => {
    mockGithubRequest
      .mockResolvedValueOnce({
        // get PR to read existing body
        number: 1,
        body: "Some description.",
        title: "My PR",
        html_url: "https://github.com/owner/repo/pull/1",
        state: "open",
        draft: false,
        head: { ref: "feat", sha: "abc" },
        base: { ref: "main" },
        user: { login: "sam" },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        merged_at: null,
      })
      .mockResolvedValueOnce({
        // patch PR with updated body
        number: 1,
        body: "Some description.\n\ncloses #7",
        title: "My PR",
        html_url: "https://github.com/owner/repo/pull/1",
        state: "open",
        draft: false,
        head: { ref: "feat", sha: "abc" },
        base: { ref: "main" },
        user: { login: "sam" },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        merged_at: null,
      });

    const result = await executeTool("link_issue_to_pull_request", {
      owner: "owner",
      repo: "repo",
      pullNumber: 1,
      issueNumber: 7,
      keyword: "closes",
    });

    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty("pullRequest");
  });

  it("rejects an invalid keyword", async () => {
    await expect(
      executeTool("link_issue_to_pull_request", {
        owner: "owner", repo: "repo", pullNumber: 1, issueNumber: 1, keyword: "merges",
      })
    ).rejects.toThrow();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });
});

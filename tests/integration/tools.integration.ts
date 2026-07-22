const BASE_URL = `http://localhost:${process.env.PORT ?? "3000"}`;
const SECRET = process.env.CONNECTOR_SECRET!;
const OWNER = "SamNewhouse";
const REPO = "github-mcp-bridge";

// PR #1 is a real, permanent PR in this repo — safe to use as a stable test fixture.
const KNOWN_PR_NUMBER = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function callTool(name: string, input: Record<string, unknown>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: input },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Tool error: ${JSON.stringify(json.error)}`);
  return JSON.parse(json.result.content[0].text);
}

async function callToolRaw(name: string, input: Record<string, unknown>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: input },
    }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// list_repositories
// ---------------------------------------------------------------------------
describe("list_repositories (integration)", () => {
  /**
   * Smoke test — asserts the response is a non-empty array of repositories
   * and that each item has the expected top-level shape.
   */
  it("returns a non-empty array of repositories with expected fields", async () => {
    const result = await callTool("list_repositories", {});

    expect(Array.isArray(result.repositories)).toBe(true);
    expect(result.repositories.length).toBeGreaterThan(0);
    const repo = result.repositories[0];
    expect(repo).toHaveProperty("full_name");
    expect(repo).toHaveProperty("private");
    expect(repo).toHaveProperty("default_branch");
  });

  /**
   * Auth rejection — request sent without an Authorization header.
   * Asserts the server returns a JSON-RPC error with code -32001.
   */
  it("rejects unauthenticated requests with error code -32001", async () => {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_repositories", arguments: {} },
      }),
    });
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32001);
  });
});

// ---------------------------------------------------------------------------
// list_branches
// ---------------------------------------------------------------------------
describe("list_branches (integration)", () => {
  /**
   * Smoke test — asserts branches array contains at least one branch
   * with name, sha, and protected fields.
   */
  it("returns branches with name, sha, and protected fields", async () => {
    const result = await callTool("list_branches", { owner: OWNER, repo: REPO });

    expect(Array.isArray(result.branches)).toBe(true);
    expect(result.branches.length).toBeGreaterThan(0);
    const branch = result.branches[0];
    expect(branch).toHaveProperty("name");
    expect(branch).toHaveProperty("sha");
    expect(typeof branch.protected).toBe("boolean");
  });

  /**
   * Missing required field — repo is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing repo field", async () => {
    const json = await callToolRaw("list_branches", { owner: OWNER });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// get_branch
// ---------------------------------------------------------------------------
describe("get_branch (integration)", () => {
  /**
   * Smoke test — fetches the main branch and asserts latest_commit fields
   * are present and the name matches.
   */
  it("returns branch detail including latest_commit for main", async () => {
    const result = await callTool("get_branch", {
      owner: OWNER,
      repo: REPO,
      branch: "main",
    });

    expect(result.branch.name).toBe("main");
    expect(result.branch).toHaveProperty("sha");
    expect(result.branch.latest_commit).toHaveProperty("message");
    expect(result.branch.latest_commit).toHaveProperty("author");
    expect(result.branch.latest_commit).toHaveProperty("date");
  });

  /**
   * Not found — branch name that does not exist.
   * Asserts the tool throws (GitHub 404 surfaced as error).
   */
  it("throws for a non-existent branch", async () => {
    await expect(
      callTool("get_branch", {
        owner: OWNER,
        repo: REPO,
        branch: "branch-that-does-not-exist-xyz",
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// list_open_pull_requests
// ---------------------------------------------------------------------------
describe("list_open_pull_requests (integration)", () => {
  /**
   * Smoke test — asserts the response is an array (possibly empty).
   * Each PR, if present, must have the expected shape.
   * Note: the tool returns pull_requests (snake_case), not pullRequests.
   */
  it("returns an array of open pull requests with expected fields", async () => {
    const result = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });

    expect(Array.isArray(result.pull_requests)).toBe(true);
    if (result.pull_requests.length > 0) {
      const pr = result.pull_requests[0];
      expect(pr).toHaveProperty("number");
      expect(pr).toHaveProperty("title");
      expect(pr).toHaveProperty("head");
      expect(pr).toHaveProperty("base");
    }
  });
});

// ---------------------------------------------------------------------------
// get_pull_request
// ---------------------------------------------------------------------------
describe("get_pull_request (integration)", () => {
  /**
   * Smoke test — fetches a known PR (#1) which is permanently in the repo.
   * Asserts all mapPullRequest fields are present regardless of PR state.
   */
  it("returns full PR detail with all mapped fields", async () => {
    const result = await callTool("get_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: KNOWN_PR_NUMBER,
    });

    expect(result.pullRequest).toHaveProperty("number", KNOWN_PR_NUMBER);
    expect(result.pullRequest).toHaveProperty("draft");
    expect(result.pullRequest).toHaveProperty("headSha");
    expect(result.pullRequest).toHaveProperty("additions");
    expect(result.pullRequest).toHaveProperty("deletions");
  });

  /**
   * Not found — pull request number that does not exist.
   * Asserts the tool throws (GitHub 404 surfaced as error).
   */
  it("throws for a non-existent pull request number", async () => {
    await expect(
      callTool("get_pull_request", {
        owner: OWNER,
        repo: REPO,
        pullNumber: 999999,
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// get_pull_request_diff
// ---------------------------------------------------------------------------
describe("get_pull_request_diff (integration)", () => {
  /**
   * Smoke test — fetches the diff for the known stable PR #1.
   * Asserts diff is a non-empty string.
   */
  it("returns a non-empty diff string for a known PR", async () => {
    const result = await callTool("get_pull_request_diff", {
      owner: OWNER,
      repo: REPO,
      pullNumber: KNOWN_PR_NUMBER,
    });

    expect(result.diff.pullNumber).toBe(KNOWN_PR_NUMBER);
    expect(typeof result.diff.diff).toBe("string");
    expect(result.diff.diff.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// list_pull_request_files
// ---------------------------------------------------------------------------
describe("list_pull_request_files (integration)", () => {
  /**
   * Smoke test — fetches changed files for the known stable PR #1.
   * Asserts files array is present and truncated is a boolean.
   */
  it("returns files and truncated flag for a known PR", async () => {
    const result = await callTool("list_pull_request_files", {
      owner: OWNER,
      repo: REPO,
      pullNumber: KNOWN_PR_NUMBER,
    });

    expect(result.files).toHaveProperty("files");
    expect(Array.isArray(result.files.files)).toBe(true);
    expect(typeof result.files.truncated).toBe("boolean");
    expect(result.files.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// list_pull_request_comments
// ---------------------------------------------------------------------------
describe("list_pull_request_comments (integration)", () => {
  /**
   * Smoke test — asserts comments array is returned for known PR #1.
   * Each comment, if present, must have id, body, and author.
   */
  it("returns a comments array for a known PR", async () => {
    const result = await callTool("list_pull_request_comments", {
      owner: OWNER,
      repo: REPO,
      pullNumber: KNOWN_PR_NUMBER,
    });

    expect(Array.isArray(result.comments)).toBe(true);
    if (result.comments.length > 0) {
      expect(result.comments[0]).toHaveProperty("id");
      expect(result.comments[0]).toHaveProperty("body");
      expect(result.comments[0]).toHaveProperty("author");
    }
  });
});

// ---------------------------------------------------------------------------
// list_issues
// ---------------------------------------------------------------------------
describe("list_issues (integration)", () => {
  /**
   * Smoke test — asserts issues array is returned and contains no PRs.
   * Each issue must have number, title, and state.
   */
  it("returns open issues excluding pull requests", async () => {
    const result = await callTool("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "open",
    });

    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(issue).toHaveProperty("number");
      expect(issue).toHaveProperty("title");
      expect(issue).toHaveProperty("state");
      expect(issue).not.toHaveProperty("pull_request");
    }
  });

  /**
   * state=closed — asserts closed issues are returned and all have state: "closed".
   */
  it("returns closed issues when state=closed", async () => {
    const result = await callTool("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "closed",
    });

    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(issue.state).toBe("closed");
    }
  });

  /**
   * Invalid state — asserts a validation error is returned.
   */
  it("rejects an invalid state value", async () => {
    const json = await callToolRaw("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "invalid",
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// get_issue
// ---------------------------------------------------------------------------
describe("get_issue (integration)", () => {
  /**
   * PR guard end-to-end — PR #1 is permanently in the repo; using its number
   * as an issue number must be rejected by the pull_request guard.
   */
  it("throws when the number belongs to a pull request", async () => {
    await expect(
      callTool("get_issue", { owner: OWNER, repo: REPO, issueNumber: KNOWN_PR_NUMBER })
    ).rejects.toThrow();
  });

  /**
   * Not found — issue number that does not exist.
   * Asserts the tool throws (GitHub 404).
   */
  it("throws for a non-existent issue number", async () => {
    await expect(
      callTool("get_issue", { owner: OWNER, repo: REPO, issueNumber: 999999 })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// list_issue_comments
// ---------------------------------------------------------------------------
describe("list_issue_comments (integration)", () => {
  /**
   * Smoke test — PR #1 is also addressable as an issue for comments.
   * Asserts array is returned; each comment has id, body, author.
   */
  it("returns comments array for a known issue/PR number", async () => {
    const result = await callTool("list_issue_comments", {
      owner: OWNER,
      repo: REPO,
      issueNumber: KNOWN_PR_NUMBER,
    });

    expect(Array.isArray(result.comments)).toBe(true);
    if (result.comments.length > 0) {
      expect(result.comments[0]).toHaveProperty("id");
      expect(result.comments[0]).toHaveProperty("body");
      expect(result.comments[0]).toHaveProperty("author");
    }
  });

  /**
   * Not found — issue number that does not exist.
   * Asserts the tool throws (GitHub 404).
   */
  it("throws for a non-existent issue number", async () => {
    await expect(
      callTool("list_issue_comments", {
        owner: OWNER,
        repo: REPO,
        issueNumber: 999999,
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// add_issue_comment
// ---------------------------------------------------------------------------
describe("add_issue_comment (integration)", () => {
  /**
   * Smoke test — posts a test comment on PR #1 (which accepts issue-style comments).
   * Asserts the returned comment has id, body, author, html_url, created_at.
   */
  it("posts a comment and returns the created comment fields", async () => {
    const body = `integration test comment ${Date.now()}`;
    const result = await callTool("add_issue_comment", {
      owner: OWNER,
      repo: REPO,
      issueNumber: KNOWN_PR_NUMBER,
      body,
    });

    expect(result.comment).toHaveProperty("id");
    expect(result.comment).toHaveProperty("body", body);
    expect(result.comment).toHaveProperty("author");
    expect(result.comment).toHaveProperty("html_url");
    expect(result.comment).toHaveProperty("created_at");
  });

  /**
   * Missing required field — body is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing body field", async () => {
    const json = await callToolRaw("add_issue_comment", {
      owner: OWNER,
      repo: REPO,
      issueNumber: KNOWN_PR_NUMBER,
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// create_issue
// ---------------------------------------------------------------------------
describe("create_issue (integration)", () => {
  /**
   * Smoke test — creates a real issue with a timestamped title so it is
   * uniquely identifiable and won't conflict with other test runs.
   * Asserts the created issue has number, title, state, html_url, author.
   */
  it("creates an issue and returns the mapped issue fields", async () => {
    const title = `integration test issue ${Date.now()}`;
    const result = await callTool("create_issue", {
      owner: OWNER,
      repo: REPO,
      title,
      body: "Created by the integration test suite. Safe to close.",
      labels: [],
    });

    expect(result.issue).toHaveProperty("number");
    expect(result.issue.number).toBeGreaterThan(0);
    expect(result.issue).toHaveProperty("title", title);
    expect(result.issue).toHaveProperty("state", "open");
    expect(result.issue).toHaveProperty("html_url");
    expect(result.issue).toHaveProperty("author");
  });

  /**
   * Missing required field — title is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing title field", async () => {
    const json = await callToolRaw("create_issue", {
      owner: OWNER,
      repo: REPO,
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// get_commit
// ---------------------------------------------------------------------------
describe("get_commit (integration)", () => {
  /**
   * Smoke test — fetches the HEAD commit of main.
   * Asserts sha, stats, and files are present.
   */
  it("returns commit detail with stats and files for a real commit SHA", async () => {
    const branch = await callTool("get_branch", {
      owner: OWNER,
      repo: REPO,
      branch: "main",
    });

    const sha = branch.branch.sha;
    const result = await callTool("get_commit", {
      owner: OWNER,
      repo: REPO,
      ref: sha,
    });

    expect(result.commit.sha).toBe(sha);
    expect(typeof result.commit.message).toBe("string");
    expect(result.commit.stats).not.toBeUndefined();
    expect(Array.isArray(result.commit.files)).toBe(true);
  });

  /**
   * Not found — non-existent SHA.
   * Asserts the tool throws (GitHub 422).
   */
  it("throws for an invalid commit SHA", async () => {
    await expect(
      callTool("get_commit", {
        owner: OWNER,
        repo: REPO,
        ref: "0000000000000000000000000000000000000000",
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// list_commits
// ---------------------------------------------------------------------------
describe("list_commits (integration)", () => {
  it("returns recent commits with expected fields", async () => {
    const result = await callTool("list_commits", {
      owner: OWNER,
      repo: REPO,
      branch: "main",
      perPage: 5,
    });

    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
    const commit = result.commits[0];
    expect(commit).toHaveProperty("sha");
    expect(commit).toHaveProperty("message");
    expect(commit).toHaveProperty("author");
    expect(commit).toHaveProperty("date");
  });

  it("filters commits to those touching a specific path", async () => {
    const result = await callTool("list_commits", {
      owner: OWNER,
      repo: REPO,
      path: "package.json",
      perPage: 10,
    });

    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
  });

  it("respects the perPage limit", async () => {
    const result = await callTool("list_commits", {
      owner: OWNER,
      repo: REPO,
      perPage: 3,
    });

    expect(result.commits.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// list_directory
// ---------------------------------------------------------------------------
describe("list_directory (integration)", () => {
  it("returns entries with file and dir types at the repo root", async () => {
    const result = await callTool("list_directory", {
      owner: OWNER,
      repo: REPO,
      path: "",
    });

    expect(Array.isArray(result.entries)).toBe(true);
    const types = result.entries.map((e: any) => e.type);
    expect(types).toContain("file");
    expect(types).toContain("dir");
  });

  it("returns file entries for a known directory path", async () => {
    const result = await callTool("list_directory", {
      owner: OWNER,
      repo: REPO,
      path: "src/github",
    });

    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.type).toBe("file");
    }
  });

  it("throws for a non-existent path", async () => {
    await expect(
      callTool("list_directory", {
        owner: OWNER,
        repo: REPO,
        path: "does/not/exist",
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// search_code
// ---------------------------------------------------------------------------
describe("search_code (integration)", () => {
  it("returns results with path and matches for a known query", async () => {
    const result = await callTool("search_code", {
      owner: OWNER,
      repo: REPO,
      query: "githubRequest",
    });

    expect(result.results.total_count).toBeGreaterThan(0);
    expect(Array.isArray(result.results.items)).toBe(true);
    const item = result.results.items[0];
    expect(item).toHaveProperty("path");
    expect(item).toHaveProperty("matches");
  });

  it("returns total_count: 0 and empty items for a query with no matches", async () => {
    const result = await callTool("search_code", {
      owner: OWNER,
      repo: REPO,
      query: "xyzzy_guaranteed_no_match_token_42",
    });

    expect(result.results.total_count).toBe(0);
    expect(result.results.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// search_files
// ---------------------------------------------------------------------------
describe("search_files (integration)", () => {
  it("returns matching files for a known path pattern", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: ".integration",
      ref: "feat/pagination",
    });

    expect(result.results.total_matched).toBeGreaterThan(0);
    expect(Array.isArray(result.results.files)).toBe(true);
    for (const file of result.results.files) {
      expect(file.path.toLowerCase()).toContain(".integration");
    }
  });

  it("returns empty result for a pattern that matches nothing", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: "xyzzy_no_match_guaranteed",
    });

    expect(result.results.total_matched).toBe(0);
    expect(result.results.files).toHaveLength(0);
  });

  it("returns results when a ref is provided", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: "github",
      ref: "main",
    });

    expect(result.results.total_matched).toBeGreaterThan(0);
  });

  it("rejects request with missing pattern field", async () => {
    const json = await callToolRaw("search_files", { owner: OWNER, repo: REPO });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// update_issue — validation paths only
// ---------------------------------------------------------------------------
describe("update_issue (integration — validation)", () => {
  it("returns an error when no update fields are provided", async () => {
    const json = await callToolRaw("update_issue", {
      owner: OWNER,
      repo: REPO,
      issueNumber: 999999,
    });
    expect(json.error).toBeDefined();
  });

  it("rejects an invalid state value with a validation error", async () => {
    const json = await callToolRaw("update_issue", {
      owner: OWNER,
      repo: REPO,
      issueNumber: 1,
      state: "merged",
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// update_pull_request — validation paths only
// ---------------------------------------------------------------------------
describe("update_pull_request (integration — validation)", () => {
  it("returns an error when no update fields are provided", async () => {
    const json = await callToolRaw("update_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: 999999,
    });
    expect(json.error).toBeDefined();
  });

  it("rejects an invalid state value with a validation error", async () => {
    const json = await callToolRaw("update_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: 1,
      state: "merged",
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// link_issue_to_pull_request
// ---------------------------------------------------------------------------
describe("link_issue_to_pull_request (integration)", () => {
  /**
   * Idempotency — calls the tool twice with the same PR/issue pair.
   * The second call must return linked: false because the closing keyword
   * was appended by the first call (or was already present).
   * Uses open PRs and issues if available, otherwise relies on the
   * known-PR + a real open issue found dynamically.
   */
  it("returns linked: false on a second call for the same PR/issue pair", async () => {
    const issues = await callTool("list_issues", { owner: OWNER, repo: REPO, state: "open" });

    if (issues.issues.length === 0) {
      // No open issues — test the idempotency of a non-existent issue number
      // which will still exercise the already-linked regex path if we pre-patch.
      // Skip gracefully — this only happens in an empty repo.
      return;
    }

    const issueNumber = issues.issues[0].number;

    // First call
    await callTool("link_issue_to_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: KNOWN_PR_NUMBER,
      issueNumber,
      keyword: "closes",
    });

    // Second call — must always return linked: false
    const second = await callTool("link_issue_to_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: KNOWN_PR_NUMBER,
      issueNumber,
      keyword: "closes",
    });

    expect(second.result.linked).toBe(false);
  });

  /**
   * Invalid keyword — keyword must be one of closes/fixes/resolves.
   */
  it("rejects an invalid keyword with a validation error", async () => {
    const json = await callToolRaw("link_issue_to_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: 1,
      issueNumber: 1,
      keyword: "merges",
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// upsert_file — validation paths only
// ---------------------------------------------------------------------------
describe("upsert_file (integration — validation)", () => {
  it("rejects request with missing content field", async () => {
    const json = await callToolRaw("upsert_file", {
      owner: OWNER,
      repo: REPO,
      path: "test.txt",
      message: "test",
      branch: "main",
    });
    expect(json.error).toBeDefined();
  });

  it("rejects request with missing branch field", async () => {
    const json = await callToolRaw("upsert_file", {
      owner: OWNER,
      repo: REPO,
      path: "test.txt",
      content: "hello",
      message: "test",
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// create_branch — validation paths only
// ---------------------------------------------------------------------------
describe("create_branch (integration — validation)", () => {
  it("throws when the base branch does not exist", async () => {
    await expect(
      callTool("create_branch", {
        owner: OWNER,
        repo: REPO,
        baseBranch: "branch-that-does-not-exist-xyz",
        newBranch: "test/should-not-be-created",
      })
    ).rejects.toThrow();
  });

  it("rejects request with missing newBranch field", async () => {
    const json = await callToolRaw("create_branch", {
      owner: OWNER,
      repo: REPO,
      baseBranch: "main",
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------
describe("unknown tool (integration)", () => {
  it("returns an error for an unknown tool name", async () => {
    const json = await callToolRaw("tool_that_does_not_exist", {});
    expect(json.error).toBeDefined();
  });
});

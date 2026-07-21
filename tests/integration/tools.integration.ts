const BASE_URL = `http://localhost:${process.env.PORT ?? "3000"}`;
const SECRET = process.env.CONNECTOR_SECRET!;
const OWNER = "SamNewhouse";
const REPO = "github-mcp-bridge";

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
   * Smoke test — fetches a known-open PR (number 1 is likely a valid
   * historical PR; the test tolerates it being closed).
   * Asserts all mapPullRequest fields are present.
   */
  it("returns full PR detail with all mapped fields", async () => {
    // Use the most recent open PR if any, otherwise skip gracefully
    const list = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });

    if (list.pull_requests.length === 0) {
      console.warn("No open PRs — skipping get_pull_request smoke test");
      return;
    }

    const prNumber = list.pull_requests[0].number;
    const result = await callTool("get_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: prNumber,
    });

    expect(result.pullRequest).toHaveProperty("number", prNumber);
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
   * Smoke test — fetches the diff for the most recent open PR.
   * Asserts diff is a non-empty string starting with "diff --git".
   */
  it("returns a non-empty diff string for an open PR", async () => {
    const list = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });

    if (list.pull_requests.length === 0) {
      console.warn("No open PRs — skipping get_pull_request_diff smoke test");
      return;
    }

    const prNumber = list.pull_requests[0].number;
    const result = await callTool("get_pull_request_diff", {
      owner: OWNER,
      repo: REPO,
      pullNumber: prNumber,
    });

    expect(result.diff.pullNumber).toBe(prNumber);
    expect(typeof result.diff.diff).toBe("string");
    expect(result.diff.diff.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// list_pull_request_files
// ---------------------------------------------------------------------------
describe("list_pull_request_files (integration)", () => {
  /**
   * Smoke test — fetches changed files for the most recent open PR.
   * Asserts files array is present and truncated is a boolean.
   */
  it("returns files and truncated flag for an open PR", async () => {
    const list = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });

    if (list.pull_requests.length === 0) {
      console.warn("No open PRs — skipping list_pull_request_files smoke test");
      return;
    }

    const prNumber = list.pull_requests[0].number;
    const result = await callTool("list_pull_request_files", {
      owner: OWNER,
      repo: REPO,
      pullNumber: prNumber,
    });

    expect(result.files).toHaveProperty("files");
    expect(typeof result.files.truncated).toBe("boolean");
    expect(result.files.truncated).toBe(false); // no PR in this repo has 100+ files
  });
});

// ---------------------------------------------------------------------------
// list_pull_request_comments
// ---------------------------------------------------------------------------
describe("list_pull_request_comments (integration)", () => {
  /**
   * Smoke test — asserts comments array is returned (may be empty).
   * Each comment, if present, must have id, body, and author.
   */
  it("returns a comments array for an open PR", async () => {
    const list = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });

    if (list.pull_requests.length === 0) {
      console.warn("No open PRs — skipping list_pull_request_comments smoke test");
      return;
    }

    const prNumber = list.pull_requests[0].number;
    const result = await callTool("list_pull_request_comments", {
      owner: OWNER,
      repo: REPO,
      pullNumber: prNumber,
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
      // Confirm PRs are filtered (no pull_request key on the mapped output)
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
   * PR guard end-to-end — uses the number of an open PR as the issue number.
   * Asserts the tool throws, confirming the pull_request guard works
   * against the real GitHub API.
   */
  it("throws when the number belongs to a pull request", async () => {
    const list = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });

    if (list.pull_requests.length === 0) {
      console.warn("No open PRs — skipping get_issue PR-guard integration test");
      return;
    }

    const prNumber = list.pull_requests[0].number;
    await expect(
      callTool("get_issue", { owner: OWNER, repo: REPO, issueNumber: prNumber })
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
   * Smoke test — finds the first closed issue and fetches its comments.
   * Asserts array is returned; each comment has id, body, author.
   */
  it("returns comments array for an issue", async () => {
    const issues = await callTool("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "closed",
    });

    if (issues.issues.length === 0) {
      console.warn("No closed issues — skipping list_issue_comments smoke test");
      return;
    }

    const issueNumber = issues.issues[0].number;
    const result = await callTool("list_issue_comments", {
      owner: OWNER,
      repo: REPO,
      issueNumber,
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
// get_commit
// ---------------------------------------------------------------------------
describe("get_commit (integration)", () => {
  /**
   * Smoke test — fetches the HEAD commit of main.
   * Asserts sha, stats, and files are present and non-null for a code commit.
   */
  it("returns commit detail with stats and files for a real commit SHA", async () => {
    // Resolve HEAD SHA via get_branch so the test doesn't hardcode a SHA
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
  /**
   * Smoke test — lists recent commits on main.
   * Asserts array is non-empty and each commit has sha, message, author, date.
   */
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

  /**
   * Path filter — filtering to a known frequently-changed file.
   * Asserts commits are returned (this file has multiple commits on main).
   */
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

  /**
   * perPage respected — requests 3 commits.
   * Asserts at most 3 are returned.
   */
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
  /**
   * Smoke test — lists the root directory.
   * Asserts entries contain both files and directories.
   */
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

  /**
   * Nested path — lists src/github.
   * Asserts only .ts files are returned (no subdirectory at that level).
   */
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

  /**
   * Not found — path that does not exist.
   * Asserts the tool throws.
   */
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
  /**
   * Smoke test — searches for a symbol known to exist in the codebase.
   * Asserts total_count > 0 and items have path and matches fields.
   */
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

  /**
   * No results — a query guaranteed to match nothing.
   * Asserts total_count is 0 and items is an empty array.
   */
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
  /**
   * Known pattern — searches for ".integration" on the feat/pagination branch
   * where all integration test files exist. Asserts at least one result is returned.
   */
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

  /**
   * No matches — pattern guaranteed not to match any file.
   * Asserts total_matched is 0 and files is empty.
   */
  it("returns empty result for a pattern that matches nothing", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: "xyzzy_no_match_guaranteed",
    });

    expect(result.results.total_matched).toBe(0);
    expect(result.results.files).toHaveLength(0);
  });

  /**
   * ref forwarding — searches on main branch.
   * Asserts results are returned confirming ref is forwarded correctly.
   */
  it("returns results when a ref is provided", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: "github",
      ref: "main",
    });

    expect(result.results.total_matched).toBeGreaterThan(0);
  });

  /**
   * Missing required field — pattern is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing pattern field", async () => {
    const json = await callToolRaw("search_files", { owner: OWNER, repo: REPO });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// update_issue — validation paths only (no mutations on real issues)
// ---------------------------------------------------------------------------
describe("update_issue (integration — validation)", () => {
  /**
   * No fields provided — update_issue requires at least one optional field.
   * Asserts a JSON-RPC error is returned when only required identifiers are sent.
   */
  it("returns an error when no update fields are provided", async () => {
    // issueNumber 999999 does not exist, but the empty-payload guard fires first
    const json = await callToolRaw("update_issue", {
      owner: OWNER,
      repo: REPO,
      issueNumber: 999999,
    });
    // Either a validation error or an AppError (No update fields provided)
    expect(json.error).toBeDefined();
  });

  /**
   * Invalid state enum — state must be "open" or "closed".
   * Asserts a validation error is returned.
   */
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
  /**
   * No fields provided — mirrors update_issue behaviour.
   * Asserts an error is returned when only pullNumber is sent.
   */
  it("returns an error when no update fields are provided", async () => {
    const json = await callToolRaw("update_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: 999999,
    });
    expect(json.error).toBeDefined();
  });

  /**
   * Invalid state enum — state must be "open" or "closed".
   */
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
// link_issue_to_pull_request — idempotency (read-only assertion)
// ---------------------------------------------------------------------------
describe("link_issue_to_pull_request (integration)", () => {
  /**
   * Idempotency — calls the tool twice with the same PR/issue pair.
   * The second call must return linked: false because the first call
   * already appended the closing keyword.
   * Uses the current feat/pagination PR and a real open issue if available.
   */
  it("returns linked: false on a second call for the same PR/issue pair", async () => {
    const prs = await callTool("list_open_pull_requests", { owner: OWNER, repo: REPO });
    const issues = await callTool("list_issues", { owner: OWNER, repo: REPO, state: "open" });

    if (prs.pull_requests.length === 0 || issues.issues.length === 0) {
      console.warn("No open PRs or issues — skipping link_issue_to_pull_request idempotency test");
      return;
    }

    const prNumber = prs.pull_requests[0].number;
    const issueNumber = issues.issues[0].number;

    // First call — may be linked or not, we don't assert here
    await callTool("link_issue_to_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: prNumber,
      issueNumber,
      keyword: "closes",
    });

    // Second call — must always return linked: false
    const second = await callTool("link_issue_to_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: prNumber,
      issueNumber,
      keyword: "closes",
    });

    expect(second.result.linked).toBe(false);
  });

  /**
   * Invalid keyword — keyword must be one of closes/fixes/resolves.
   * Asserts a validation error is returned.
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
// upsert_file — validation paths only (no untracked writes to main)
// ---------------------------------------------------------------------------
describe("upsert_file (integration — validation)", () => {
  /**
   * Missing required field — content is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing content field", async () => {
    const json = await callToolRaw("upsert_file", {
      owner: OWNER,
      repo: REPO,
      path: "test.txt",
      message: "test",
      branch: "main",
      // content intentionally omitted
    });
    expect(json.error).toBeDefined();
  });

  /**
   * Missing required field — branch is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing branch field", async () => {
    const json = await callToolRaw("upsert_file", {
      owner: OWNER,
      repo: REPO,
      path: "test.txt",
      content: "hello",
      message: "test",
      // branch intentionally omitted
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// create_branch — validation paths only (no branch creation on main)
// ---------------------------------------------------------------------------
describe("create_branch (integration — validation)", () => {
  /**
   * Non-existent base branch — GitHub returns 404 when the base doesn't exist.
   * Asserts the tool throws, confirming the error is propagated correctly.
   */
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

  /**
   * Missing required field — newBranch is omitted.
   * Asserts a validation error is returned.
   */
  it("rejects request with missing newBranch field", async () => {
    const json = await callToolRaw("create_branch", {
      owner: OWNER,
      repo: REPO,
      baseBranch: "main",
      // newBranch intentionally omitted
    });
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------
describe("unknown tool (integration)", () => {
  /**
   * Asserts the server returns a JSON-RPC error when a tool name that
   * doesn't exist is called, rather than crashing or returning null.
   */
  it("returns an error for an unknown tool name", async () => {
    const json = await callToolRaw("tool_that_does_not_exist", {});
    expect(json.error).toBeDefined();
  });
});

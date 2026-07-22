const BASE_URL = `http://localhost:${process.env.PORT ?? "3000"}`;
const SECRET = process.env.CONNECTOR_SECRET!;
const OWNER = "SamNewhouse";
const REPO = "github-mcp-bridge";

const KNOWN_PR_NUMBER = 1;

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

/**
 * list_repositories (integration)
 *
 * Verifies the tool returns a non-empty list of repositories accessible to
 * the configured PAT, with the expected mapped fields. Also confirms that
 * unauthenticated requests are rejected with error code -32001.
 */
describe("list_repositories (integration)", () => {
  it("returns a non-empty array of repositories with expected fields", async () => {
    const result = await callTool("list_repositories", {});
    expect(Array.isArray(result.repositories)).toBe(true);
    expect(result.repositories.length).toBeGreaterThan(0);
    const repo = result.repositories[0];
    expect(repo).toHaveProperty("full_name");
    expect(repo).toHaveProperty("private");
    expect(repo).toHaveProperty("default_branch");
  });

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

/**
 * list_branches (integration)
 *
 * Verifies the tool returns branches with the correct mapped fields
 * (name, sha, protected) for the target repo. Also confirms that a
 * request missing the required repo field is rejected with an error.
 */
describe("list_branches (integration)", () => {
  it("returns branches with name, sha, and protected fields", async () => {
    const result = await callTool("list_branches", { owner: OWNER, repo: REPO });
    expect(Array.isArray(result.branches)).toBe(true);
    expect(result.branches.length).toBeGreaterThan(0);
    const branch = result.branches[0];
    expect(branch).toHaveProperty("name");
    expect(branch).toHaveProperty("sha");
    expect(typeof branch.protected).toBe("boolean");
  });

  it("rejects request with missing repo field", async () => {
    const json = await callToolRaw("list_branches", { owner: OWNER });
    expect(json.error).toBeDefined();
  });
});

/**
 * get_branch (integration)
 *
 * Verifies the tool returns full branch detail including latest_commit
 * (message, author, date) for an existing branch. Also confirms that
 * requesting a non-existent branch throws an error.
 */
describe("get_branch (integration)", () => {
  it("returns branch detail including latest_commit for main", async () => {
    const result = await callTool("get_branch", { owner: OWNER, repo: REPO, branch: "main" });
    expect(result.branch.name).toBe("main");
    expect(result.branch).toHaveProperty("sha");
    expect(result.branch.latest_commit).toHaveProperty("message");
    expect(result.branch.latest_commit).toHaveProperty("author");
    expect(result.branch.latest_commit).toHaveProperty("date");
  });

  it("throws for a non-existent branch", async () => {
    await expect(
      callTool("get_branch", { owner: OWNER, repo: REPO, branch: "branch-that-does-not-exist-xyz" })
    ).rejects.toThrow();
  });
});

/**
 * list_open_pull_requests (integration)
 *
 * Verifies the tool returns an array of open PRs. When PRs exist, checks
 * that each entry has the expected summary fields (number, title, head, base).
 * The array may be empty if there are no open PRs at the time of the run.
 */
describe("list_open_pull_requests (integration)", () => {
  it("returns an array of open pull requests with expected fields", async () => {
    const result = await callTool("list_open_pull_requests", { owner: OWNER, repo: REPO });
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

/**
 * list_pull_requests (integration)
 *
 * Verifies the tool returns PRs filtered by state. Uses state=all to
 * guarantee a non-empty result. Confirms the full mapped shape including
 * the draft field. Also verifies that an invalid state value is rejected.
 */
describe("list_pull_requests (integration)", () => {
  it("returns an array when state=all", async () => {
    const result = await callTool("list_pull_requests", { owner: OWNER, repo: REPO, state: "all" });
    expect(Array.isArray(result.pull_requests)).toBe(true);
    expect(result.pull_requests.length).toBeGreaterThan(0);
  });

  it("each PR has the expected mapped fields", async () => {
    const result = await callTool("list_pull_requests", { owner: OWNER, repo: REPO, state: "all" });
    for (const pr of result.pull_requests) {
      expect(pr).toHaveProperty("number");
      expect(pr).toHaveProperty("title");
      expect(pr).toHaveProperty("state");
      expect(pr).toHaveProperty("draft");
      expect(pr).toHaveProperty("html_url");
      expect(pr).toHaveProperty("author");
      expect(pr).toHaveProperty("head");
      expect(pr).toHaveProperty("base");
      expect(pr).toHaveProperty("created_at");
      expect(pr).toHaveProperty("updated_at");
    }
  });

  it("rejects an invalid state value", async () => {
    const json = await callToolRaw("list_pull_requests", { owner: OWNER, repo: REPO, state: "invalid" });
    expect(json.error).toBeDefined();
  });
});

/**
 * get_pull_request (integration)
 *
 * Verifies the tool returns full PR detail for a known PR number, including
 * draft, headSha, additions, and deletions. Also confirms that requesting
 * a non-existent PR number throws an error.
 */
describe("get_pull_request (integration)", () => {
  it("returns full PR detail with all mapped fields", async () => {
    const result = await callTool("get_pull_request", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    expect(result.pullRequest).toHaveProperty("number", KNOWN_PR_NUMBER);
    expect(result.pullRequest).toHaveProperty("draft");
    expect(result.pullRequest).toHaveProperty("headSha");
    expect(result.pullRequest).toHaveProperty("additions");
    expect(result.pullRequest).toHaveProperty("deletions");
  });

  it("throws for a non-existent pull request number", async () => {
    await expect(
      callTool("get_pull_request", { owner: OWNER, repo: REPO, pullNumber: 999999 })
    ).rejects.toThrow();
  });
});

/**
 * get_pull_request_diff (integration)
 *
 * Verifies the tool returns a non-empty raw unified diff string for a known
 * PR, confirming the Accept header and responseType handling works end-to-end
 * through the live server.
 */
describe("get_pull_request_diff (integration)", () => {
  it("returns a non-empty diff string for a known PR", async () => {
    const result = await callTool("get_pull_request_diff", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    expect(result.diff.pullNumber).toBe(KNOWN_PR_NUMBER);
    expect(typeof result.diff.diff).toBe("string");
    expect(result.diff.diff.length).toBeGreaterThan(0);
  });
});

/**
 * get_pull_request_reviews (integration)
 *
 * Verifies the tool returns a reviews array for a known PR. When reviews
 * exist, checks that each entry has the expected mapped fields (id, state,
 * body, author, commit_id, submitted_at, html_url). Also confirms that
 * requesting a non-existent PR number throws an error.
 */
describe("get_pull_request_reviews (integration)", () => {
  it("returns a reviews array for a known PR", async () => {
    const result = await callTool("get_pull_request_reviews", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    expect(Array.isArray(result.reviews)).toBe(true);
  });

  it("each review has the expected response shape", async () => {
    const result = await callTool("get_pull_request_reviews", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    if (result.reviews.length > 0) {
      const review = result.reviews[0];
      expect(review).toHaveProperty("id");
      expect(review).toHaveProperty("state");
      expect(review).toHaveProperty("body");
      expect(review).toHaveProperty("author");
      expect(review).toHaveProperty("commit_id");
      expect(review).toHaveProperty("submitted_at");
      expect(review).toHaveProperty("html_url");
    }
  });

  it("throws for a non-existent pull request number", async () => {
    await expect(
      callTool("get_pull_request_reviews", { owner: OWNER, repo: REPO, pullNumber: 999999 })
    ).rejects.toThrow();
  });
});

/**
 * list_pull_request_files (integration)
 *
 * Verifies the tool returns a files array and truncated flag for a known PR.
 * When files exist, checks that each entry has the expected shape (path,
 * status, additions, deletions, changes, blob_url).
 */
describe("list_pull_request_files (integration)", () => {
  it("returns files and truncated flag for a known PR", async () => {
    const result = await callTool("list_pull_request_files", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    expect(result.files).toHaveProperty("files");
    expect(Array.isArray(result.files.files)).toBe(true);
    expect(typeof result.files.truncated).toBe("boolean");
  });

  it("each file entry has the expected shape", async () => {
    const result = await callTool("list_pull_request_files", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    if (result.files.files.length > 0) {
      const file = result.files.files[0];
      expect(file).toHaveProperty("path");
      expect(file).toHaveProperty("status");
      expect(file).toHaveProperty("additions");
      expect(file).toHaveProperty("deletions");
      expect(file).toHaveProperty("changes");
      expect(file).toHaveProperty("blob_url");
    }
  });
});

/**
 * list_pull_request_comments (integration)
 *
 * Verifies the tool returns a comments array for a known PR. When comments
 * exist, checks that each entry has the expected mapped fields (id, body,
 * author, html_url, created_at, updated_at).
 */
describe("list_pull_request_comments (integration)", () => {
  it("returns a comments array for a known PR", async () => {
    const result = await callTool("list_pull_request_comments", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    expect(Array.isArray(result.comments)).toBe(true);
    if (result.comments.length > 0) {
      expect(result.comments[0]).toHaveProperty("id");
      expect(result.comments[0]).toHaveProperty("body");
      expect(result.comments[0]).toHaveProperty("author");
    }
  });

  it("each comment has the expected response shape", async () => {
    const result = await callTool("list_pull_request_comments", { owner: OWNER, repo: REPO, pullNumber: KNOWN_PR_NUMBER });
    if (result.comments.length > 0) {
      const comment = result.comments[0];
      expect(comment).toHaveProperty("id");
      expect(comment).toHaveProperty("body");
      expect(comment).toHaveProperty("author");
      expect(comment).toHaveProperty("html_url");
      expect(comment).toHaveProperty("created_at");
      expect(comment).toHaveProperty("updated_at");
    }
  });
});

/**
 * list_issues (integration)
 *
 * Verifies the tool returns issues filtered by state, excluding pull
 * requests. Confirms closed issues have state=closed. Also verifies
 * that an invalid state value is rejected with an error.
 */
describe("list_issues (integration)", () => {
  it("returns open issues excluding pull requests", async () => {
    const result = await callTool("list_issues", { owner: OWNER, repo: REPO, state: "open" });
    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(issue).toHaveProperty("number");
      expect(issue).toHaveProperty("title");
      expect(issue).toHaveProperty("state");
      expect(issue).not.toHaveProperty("pull_request");
    }
  });

  it("returns closed issues when state=closed", async () => {
    const result = await callTool("list_issues", { owner: OWNER, repo: REPO, state: "closed" });
    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(issue.state).toBe("closed");
    }
  });

  it("rejects an invalid state value", async () => {
    const json = await callToolRaw("list_issues", { owner: OWNER, repo: REPO, state: "invalid" });
    expect(json.error).toBeDefined();
  });
});

// The first closed integration-test issue created by the old test suite.
// It is permanently closed and safe to use as a stable read fixture.
const KNOWN_ISSUE_NUMBER = 15;

/**
 * get_issue (integration)
 *
 * Verifies the tool returns the expected shape for a known closed issue.
 * Also confirms a PR number is rejected by the pull_request guard, and
 * that a non-existent issue number throws.
 */
describe("get_issue (integration)", () => {
  it("returns the expected fields for a known closed issue", async () => {
    const result = await callTool("get_issue", {
      owner: OWNER,
      repo: REPO,
      issueNumber: KNOWN_ISSUE_NUMBER,
    });
    expect(result.issue).toHaveProperty("number", KNOWN_ISSUE_NUMBER);
    expect(result.issue).toHaveProperty("title");
    expect(result.issue).toHaveProperty("state", "closed");
    expect(result.issue).toHaveProperty("html_url");
    expect(result.issue).toHaveProperty("author");
    expect(result.issue).toHaveProperty("body");
    expect(result.issue).toHaveProperty("labels");
    expect(result.issue).toHaveProperty("assignees");
    expect(result.issue).toHaveProperty("created_at");
    expect(result.issue).toHaveProperty("updated_at");
  });

  it("throws when the number belongs to a pull request", async () => {
    await expect(
      callTool("get_issue", { owner: OWNER, repo: REPO, issueNumber: KNOWN_PR_NUMBER })
    ).rejects.toThrow();
  });

  it("throws for a non-existent issue number", async () => {
    await expect(
      callTool("get_issue", { owner: OWNER, repo: REPO, issueNumber: 999999 })
    ).rejects.toThrow();
  });
});

/**
 * create_issue (integration — validation only)
 *
 * Does NOT create real issues. Verifies the input validation layer only:
 * missing required fields must be rejected before any GitHub API call is made.
 * Real creation is covered by the create_issue unit tests.
 */
describe("create_issue (integration — validation)", () => {
  it("rejects request with missing title field", async () => {
    const json = await callToolRaw("create_issue", {
      owner: OWNER,
      repo: REPO,
    });
    expect(json.error).toBeDefined();
  });

  it("rejects request with missing owner field", async () => {
    const json = await callToolRaw("create_issue", {
      repo: REPO,
      title: "should not be created",
    });
    expect(json.error).toBeDefined();
  });
});

/**
 * list_issue_comments (integration)
 *
 * Verifies the tool returns a comments array for a known issue/PR number,
 * with each entry having the expected mapped fields. Also confirms that
 * requesting a non-existent issue number throws an error.
 */
describe("list_issue_comments (integration)", () => {
  it("returns comments array for a known issue/PR number", async () => {
    const result = await callTool("list_issue_comments", { owner: OWNER, repo: REPO, issueNumber: KNOWN_PR_NUMBER });
    expect(Array.isArray(result.comments)).toBe(true);
    if (result.comments.length > 0) {
      expect(result.comments[0]).toHaveProperty("id");
      expect(result.comments[0]).toHaveProperty("body");
      expect(result.comments[0]).toHaveProperty("author");
    }
  });

  it("throws for a non-existent issue number", async () => {
    await expect(
      callTool("list_issue_comments", { owner: OWNER, repo: REPO, issueNumber: 999999 })
    ).rejects.toThrow();
  });
});

/**
 * get_commit (integration)
 *
 * Verifies the tool returns full commit detail (sha, message, stats, files)
 * for a real commit SHA resolved from the main branch tip. Also confirms
 * that an invalid/non-existent SHA throws an error.
 */
describe("get_commit (integration)", () => {
  it("returns commit detail with stats and files for a real commit SHA", async () => {
    const branch = await callTool("get_branch", { owner: OWNER, repo: REPO, branch: "main" });
    const sha = branch.branch.sha;
    const result = await callTool("get_commit", { owner: OWNER, repo: REPO, ref: sha });
    expect(result.commit.sha).toBe(sha);
    expect(typeof result.commit.message).toBe("string");
    expect(result.commit.stats).not.toBeUndefined();
    expect(Array.isArray(result.commit.files)).toBe(true);
  });

  it("throws for an invalid commit SHA", async () => {
    await expect(
      callTool("get_commit", { owner: OWNER, repo: REPO, ref: "0000000000000000000000000000000000000000" })
    ).rejects.toThrow();
  });
});

/**
 * list_commits (integration)
 *
 * Verifies the tool returns recent commits with expected mapped fields
 * (sha, message, author, date). Confirms branch and path filters are
 * forwarded correctly, and that the perPage limit is respected.
 */
describe("list_commits (integration)", () => {
  it("returns recent commits with expected fields", async () => {
    const result = await callTool("list_commits", { owner: OWNER, repo: REPO, branch: "main", perPage: 5 });
    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
    const commit = result.commits[0];
    expect(commit).toHaveProperty("sha");
    expect(commit).toHaveProperty("message");
    expect(commit).toHaveProperty("author");
    expect(commit).toHaveProperty("date");
  });

  it("filters commits to those touching a specific path", async () => {
    const result = await callTool("list_commits", { owner: OWNER, repo: REPO, path: "package.json", perPage: 10 });
    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
  });

  it("respects the perPage limit", async () => {
    const result = await callTool("list_commits", { owner: OWNER, repo: REPO, perPage: 3 });
    expect(result.commits.length).toBeLessThanOrEqual(3);
  });
});

/**
 * list_directory (integration)
 *
 * Verifies the tool returns directory entries with both file and dir types
 * at the repo root, and only file entries for a known leaf directory.
 * Also confirms that a non-existent path throws an error.
 */
describe("list_directory (integration)", () => {
  it("returns entries with file and dir types at the repo root", async () => {
    const result = await callTool("list_directory", { owner: OWNER, repo: REPO, path: "" });
    expect(Array.isArray(result.entries)).toBe(true);
    const types = result.entries.map((e: any) => e.type);
    expect(types).toContain("file");
    expect(types).toContain("dir");
  });

  it("returns file entries for a known directory path", async () => {
    const result = await callTool("list_directory", { owner: OWNER, repo: REPO, path: "src/github" });
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.type).toBe("file");
    }
  });

  it("throws for a non-existent path", async () => {
    await expect(
      callTool("list_directory", { owner: OWNER, repo: REPO, path: "does/not/exist" })
    ).rejects.toThrow();
  });
});

/**
 * search_code (integration)
 *
 * Verifies the tool returns results with path and matches fragments for a
 * query known to exist in the repo. Also confirms that a query guaranteed
 * to match nothing returns total_count: 0 and an empty items array.
 */
describe("search_code (integration)", () => {
  it("returns results with path and matches for a known query", async () => {
    const result = await callTool("search_code", { owner: OWNER, repo: REPO, query: "githubRequest" });
    expect(result.results.total_count).toBeGreaterThan(0);
    expect(Array.isArray(result.results.items)).toBe(true);
    const item = result.results.items[0];
    expect(item).toHaveProperty("path");
    expect(item).toHaveProperty("matches");
  });

  it("returns total_count: 0 and empty items for a query with no matches", async () => {
    // The query string must never appear literally in any source file —
    // including this test file itself. We build it at runtime from parts
    // so it is never present as a literal string in the codebase.
    const noMatchQuery = ["xQ9", "zW2", "mK7"].join("__nomatch__");
    const result = await callTool("search_code", { owner: OWNER, repo: REPO, query: noMatchQuery });
    expect(result.results.total_count).toBe(0);
    expect(result.results.items).toHaveLength(0);
  });
});

/**
 * search_files (integration)
 *
 * Verifies the tool returns matching file paths for a known pattern and an
 * empty result for a pattern that matches nothing. Confirms the ref parameter
 * is forwarded correctly. Also verifies that a request missing the required
 * pattern field is rejected with an error.
 */
describe("search_files (integration)", () => {
  it("returns matching files for a known path pattern", async () => {
    const result = await callTool("search_files", { owner: OWNER, repo: REPO, pattern: ".integration", ref: "main" });
    expect(result.results.total_matched).toBeGreaterThan(0);
    expect(Array.isArray(result.results.files)).toBe(true);
    for (const file of result.results.files) {
      expect(file.path.toLowerCase()).toContain(".integration");
    }
  });

  it("returns empty result for a pattern that matches nothing", async () => {
    const result = await callTool("search_files", { owner: OWNER, repo: REPO, pattern: "xyzzy_no_match_guaranteed" });
    expect(result.results.total_matched).toBe(0);
    expect(result.results.files).toHaveLength(0);
  });

  it("returns results when a ref is provided", async () => {
    const result = await callTool("search_files", { owner: OWNER, repo: REPO, pattern: "github", ref: "main" });
    expect(result.results.total_matched).toBeGreaterThan(0);
  });

  it("rejects request with missing pattern field", async () => {
    const json = await callToolRaw("search_files", { owner: OWNER, repo: REPO });
    expect(json.error).toBeDefined();
  });
});

/**
 * unknown tool (integration)
 *
 * Verifies the server returns a structured error response (not a crash)
 * when a tool name that doesn't exist is called. This confirms the tool
 * dispatcher handles unknown names gracefully.
 */
describe("unknown tool (integration)", () => {
  it("returns an error for an unknown tool name", async () => {
    const json = await callToolRaw("tool_that_does_not_exist", {});
    expect(json.error).toBeDefined();
  });
});

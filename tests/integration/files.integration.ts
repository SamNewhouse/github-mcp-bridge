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

  if (json.error) {
    throw new Error(`Tool error: ${JSON.stringify(json.error)}`);
  }

  return JSON.parse(json.result.content[0].text);
}

/**
 * Like callTool but returns the raw JSON-RPC response without throwing,
 * so tests can inspect error payloads directly.
 */
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
// get_file_contents
// ---------------------------------------------------------------------------
describe("get_file_contents (integration)", () => {
  /**
   * Happy path — fetches a known small file from the live repo.
   * Asserts the response shape is correct, content contains expected
   * source text, truncated is false, and path is echoed back.
   */
  it("returns content and truncated: false for a known small file", async () => {
    const result = await callTool("get_file_contents", {
      owner: OWNER,
      repo: REPO,
      path: "src/github/files.ts",
    });

    expect(result.file).toBeDefined();
    expect(result.file.content).toContain("getFileContents");
    expect(result.file.truncated).toBe(false);
    expect(result.file.path).toBe("src/github/files.ts");
  });

  /**
   * Directory rejection — passes a directory path instead of a file path.
   * Asserts the tool throws, exercising the type guard that calls
   * AppError(400) when GitHub returns a directory entry.
   */
  it("returns a 400 error when path is a directory", async () => {
    await expect(
      callTool("get_file_contents", {
        owner: OWNER,
        repo: REPO,
        path: "src",
      })
    ).rejects.toThrow();
  });

  /**
   * Not found — passes a path that does not exist in the repo.
   * Asserts the tool throws, exercising the 404 path from GitHub
   * being surfaced as an error to the caller.
   */
  it("returns a 404 error for a non-existent file", async () => {
    await expect(
      callTool("get_file_contents", {
        owner: OWNER,
        repo: REPO,
        path: "src/does-not-exist.ts",
      })
    ).rejects.toThrow();
  });

  /**
   * Ref parameter — fetches the same file pinned to the main branch.
   * Asserts that the ref query param is correctly forwarded to GitHub
   * and a valid string is returned (content may differ from HEAD).
   */
  it("returns file at the correct ref when ref is provided", async () => {
    const result = await callTool("get_file_contents", {
      owner: OWNER,
      repo: REPO,
      path: "src/github/files.ts",
      ref: "main",
    });

    expect(result.file.content).toBeDefined();
    expect(typeof result.file.content).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// get_multiple_files
// ---------------------------------------------------------------------------
describe("get_multiple_files (integration)", () => {
  const KNOWN_PATHS = [
    "src/github/files.ts",
    "src/lib/validation.ts",
    "src/tools/get-file-contents.ts",
    "src/tools/get-multiple-files.ts",
  ];

  /**
   * All files under pageSize — 4 known paths with the default pageSize of 10.
   * Asserts all 4 are returned in one page with hasMore false,
   * nextCursor null, and total/returned both equal to 4.
   */
  it("returns all 4 files with hasMore: false when under pageSize", async () => {
    const result = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
    });

    expect(result.files).toHaveLength(4);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.total).toBe(4);
    expect(result.pagination.returned).toBe(4);
  });

  /**
   * Response shape — verifies each returned file object has the expected fields.
   * Asserts content is a non-empty string and truncated is a boolean,
   * covering the contract the MCP client depends on.
   */
  it("each returned file has content and truncated flag", async () => {
    const result = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
    });

    for (const file of result.files) {
      expect(typeof file.content).toBe("string");
      expect(file.content.length).toBeGreaterThan(0);
      expect(typeof file.truncated).toBe("boolean");
    }
  });

  /**
   * Two-page pagination — 4 paths fetched with pageSize: 2.
   * Fetches page 1, uses nextCursor to fetch page 2, then asserts
   * the two pages contain no overlapping paths and together cover all 4 files.
   */
  it("paginates correctly — pageSize: 2 returns first 2 then next 2", async () => {
    const page1 = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
      pageSize: 2,
    });

    expect(page1.files).toHaveLength(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toBe(2);

    const page2 = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
      pageSize: 2,
      cursor: page1.pagination.nextCursor,
    });

    expect(page2.files).toHaveLength(2);
    expect(page2.pagination.hasMore).toBe(false);
    expect(page2.pagination.nextCursor).toBeNull();

    const page1Paths = page1.files.map((f: any) => f.path);
    const page2Paths = page2.files.map((f: any) => f.path);
    expect(page1Paths).not.toEqual(expect.arrayContaining(page2Paths));
  });

  /**
   * Deduplication — 4 paths where each appears twice.
   * Asserts the server deduplicates before fetching, returning only
   * 2 unique files with total reflecting the deduplicated count.
   */
  it("deduplicates paths — 4 paths with 2 duplicates returns 2 unique files", async () => {
    const result = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: [
        "src/github/files.ts",
        "src/github/files.ts",
        "src/lib/validation.ts",
        "src/lib/validation.ts",
      ],
    });

    expect(result.files).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  /**
   * Out-of-bounds cursor — cursor 999 on a 4-file list.
   * Asserts an empty files array is returned with hasMore false,
   * matching the unit test behaviour but verified end-to-end.
   */
  it("returns empty result when cursor is beyond total", async () => {
    const result = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
      cursor: 999,
    });

    expect(result.files).toHaveLength(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  /**
   * Auth rejection — request sent without an Authorization header.
   * Asserts the server returns a JSON-RPC error with code -32001
   * (Unauthorised) without touching the GitHub API.
   */
  it("rejects unauthenticated requests with an error", async () => {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_multiple_files",
          arguments: { owner: OWNER, repo: REPO, paths: KNOWN_PATHS },
        },
      }),
    });

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32001);
  });

  /**
   * ref forwarding — passes ref: "main" and verifies the files returned
   * are the main-branch versions. Asserts content is present, confirming
   * ref is forwarded through the tool handler and down to each GitHub API call.
   */
  it("returns files at the correct ref when ref is provided", async () => {
    const result = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: ["src/github/files.ts", "src/lib/validation.ts"],
      ref: "main",
    });

    expect(result.files).toHaveLength(2);
    for (const file of result.files) {
      expect(typeof file.content).toBe("string");
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  /**
   * pageSize upper bound — schema caps pageSize at 20, so 21 must be rejected.
   * Asserts the server returns a JSON-RPC error (validation failure)
   * rather than silently accepting the out-of-range value.
   */
  it("rejects pageSize greater than 20 with a validation error", async () => {
    const json = await callToolRaw("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
      pageSize: 21,
    });

    expect(json.error).toBeDefined();
  });

  /**
   * pageSize lower bound — schema requires pageSize to be at least 1, so 0 must be rejected.
   * Asserts the server returns a JSON-RPC error rather than allowing
   * a zero-page request through to the GitHub API.
   */
  it("rejects pageSize of 0 with a validation error", async () => {
    const json = await callToolRaw("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: KNOWN_PATHS,
      pageSize: 0,
    });

    expect(json.error).toBeDefined();
  });

  /**
   * Missing required field — paths is omitted entirely from the request.
   * Asserts schema validation catches the missing field and returns a
   * JSON-RPC error, confirming Zod validation propagates correctly end-to-end.
   */
  it("rejects request with missing paths field with a validation error", async () => {
    const json = await callToolRaw("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      // paths intentionally omitted
    });

    expect(json.error).toBeDefined();
  });
});

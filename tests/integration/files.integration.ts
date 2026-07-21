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

// ---------------------------------------------------------------------------
// get_file_contents
// ---------------------------------------------------------------------------
describe("get_file_contents (integration)", () => {
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

  it("returns a 400 error when path is a directory", async () => {
    await expect(
      callTool("get_file_contents", {
        owner: OWNER,
        repo: REPO,
        path: "src",
      })
    ).rejects.toThrow();
  });

  it("returns a 404 error for a non-existent file", async () => {
    await expect(
      callTool("get_file_contents", {
        owner: OWNER,
        repo: REPO,
        path: "src/does-not-exist.ts",
      })
    ).rejects.toThrow();
  });

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

    // No overlap between pages
    const page1Paths = page1.files.map((f: any) => f.path);
    const page2Paths = page2.files.map((f: any) => f.path);
    expect(page1Paths).not.toEqual(expect.arrayContaining(page2Paths));
  });

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
});

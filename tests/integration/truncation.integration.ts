import { callTool, OWNER, REPO } from "./helpers";

describe("get_file_contents truncation", () => {
  it("returns truncated content and metadata for a large file", async () => {
    const result = await callTool("get_file_contents", {
      owner: OWNER,
      repo: REPO,
      path: "README.md",
    });

    expect(result.file).toHaveProperty("truncated");
    expect(typeof result.file.truncated).toBe("boolean");

    if (result.file.truncated) {
      expect(result.file).toHaveProperty("truncatedAt");
      expect(result.file).toHaveProperty("fullSizeBytes");
      expect(typeof result.file.fullSizeBytes).toBe("number");
      expect(typeof result.file.truncatedAt).toBe("number");
      expect(result.file.content.length).toBeLessThan(
        result.file.fullSizeBytes,
      );
    }
  });
});

describe("get_multiple_files pagination", () => {
  it("returns pagination metadata and nextCursor when there are more files", async () => {
    const first = await callTool("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: [
        "src/server.ts",
        "src/router.ts",
        "src/config.ts",
        "src/auth.ts",
        "src/github/client.ts",
        "src/github/files.ts",
        "src/github/branches.ts",
        "src/github/commits.ts",
      ],
      pageSize: 3,
    });

    expect(first.pagination).toHaveProperty("hasMore");
    expect(first.pagination).toHaveProperty("nextCursor");

    if (first.pagination.hasMore) {
      expect(first.pagination.nextCursor).not.toBeNull();

      const second = await callTool("get_multiple_files", {
        owner: OWNER,
        repo: REPO,
        paths: [
          "src/server.ts",
          "src/router.ts",
          "src/config.ts",
          "src/auth.ts",
          "src/github/client.ts",
          "src/github/files.ts",
          "src/github/branches.ts",
          "src/github/commits.ts",
        ],
        pageSize: 3,
        cursor: first.pagination.nextCursor,
      });

      expect(second.pagination.cursor).toBe(first.pagination.nextCursor);
    }
  });
});

import { Buffer } from "node:buffer";

// Mock the GitHub client before importing the module under test
jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import { getFileContents, getMultipleFiles } from "../../src/github/files";

const mockGithubRequest = githubRequest as jest.MockedFunction<
  typeof githubRequest
>;

// Helper to build a fake GitHub file response
function makeGitHubFile(content: string, path = "src/example.ts") {
  return {
    type: "file" as const,
    name: path.split("/").pop()!,
    path,
    sha: "abc123",
    size: Buffer.byteLength(content, "utf8"),
    encoding: "base64",
    content: Buffer.from(content, "utf8").toString("base64"),
  };
}

beforeEach(() => {
  mockGithubRequest.mockReset();
});

// ---------------------------------------------------------------------------
// getFileContents
// ---------------------------------------------------------------------------
describe("getFileContents", () => {
  it("returns decoded content and truncated: false for a normal file", async () => {
    const raw = "export const hello = 'world';";
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(raw));

    const result = await getFileContents("owner", "repo", "src/example.ts");

    expect(result.content).toBe(raw);
    expect(result.truncated).toBe(false);
    expect(result).not.toHaveProperty("fullSizeBytes");
  });

  it("truncates content and sets truncated: true when file exceeds 3.5 MB", async () => {
    const BUDGET = 3.5 * 1024 * 1024;
    const oversized = "x".repeat(Math.ceil(BUDGET) + 1000);
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(oversized));

    const result = await getFileContents("owner", "repo", "src/big.ts");

    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(Math.ceil(BUDGET) + 1);
    expect(result).toHaveProperty("fullSizeBytes");
    expect((result as any).fullSizeBytes).toBeGreaterThan(BUDGET);
    expect((result as any).truncatedAt).toBe(BUDGET);
  });

  it("throws when the path is a directory", async () => {
    mockGithubRequest.mockResolvedValueOnce({
      type: "dir",
      name: "src",
      path: "src",
      sha: "abc",
      size: 0,
      encoding: "none",
      content: "",
    });

    await expect(
      getFileContents("owner", "repo", "src")
    ).rejects.toThrow("Path is not a file: src");
  });

  it("correctly decodes base64 encoded content", async () => {
    const original = "const x = 42;\nconst y = 'hello';";
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(original));

    const result = await getFileContents("owner", "repo", "src/example.ts");

    expect(result.content).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// getMultipleFiles
// ---------------------------------------------------------------------------
describe("getMultipleFiles", () => {
  const paths = [
    "src/a.ts",
    "src/b.ts",
    "src/c.ts",
    "src/d.ts",
    "src/e.ts",
    "src/f.ts",
    "src/g.ts",
    "src/h.ts",
    "src/i.ts",
    "src/j.ts",
    "src/k.ts",
    "src/l.ts",
  ];

  function mockFiles(count: number, content = "export default {};\n") {
    for (let i = 0; i < count; i++) {
      mockGithubRequest.mockResolvedValueOnce(
        makeGitHubFile(content, paths[i]!)
      );
    }
  }

  it("returns first 10 files with hasMore: true for a 12-file list", async () => {
    mockFiles(10);

    const result = await getMultipleFiles("owner", "repo", paths);

    expect(result.files).toHaveLength(10);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe(10);
    expect(result.pagination.total).toBe(12);
    expect(result.pagination.returned).toBe(10);
    expect(result.pagination.cursor).toBe(0);
  });

  it("returns remaining 2 files when cursor: 10 on a 12-file list", async () => {
    mockFiles(2);

    const result = await getMultipleFiles("owner", "repo", paths, undefined, 10);

    expect(result.files).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.cursor).toBe(10);
  });

  it("deduplicates paths before fetching", async () => {
    const duped = ["src/a.ts", "src/a.ts", "src/b.ts", "src/b.ts"];
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("a", "src/a.ts"))
      .mockResolvedValueOnce(makeGitHubFile("b", "src/b.ts"));

    const result = await getMultipleFiles("owner", "repo", duped);

    expect(result.files).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
  });

  it("returns empty result when cursor is beyond array length", async () => {
    const result = await getMultipleFiles(
      "owner",
      "repo",
      ["src/a.ts"],
      undefined,
      999
    );

    expect(result.files).toHaveLength(0);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  it("respects a custom pageSize", async () => {
    mockFiles(3);

    const result = await getMultipleFiles(
      "owner",
      "repo",
      paths,
      undefined,
      0,
      3
    );

    expect(result.files).toHaveLength(3);
    expect(result.pagination.pageSize).toBe(3);
    expect(result.pagination.nextCursor).toBe(3);
  });

  it("stops early and adjusts nextCursor when byte budget would be exceeded mid-page", async () => {
    const BUDGET = 3.5 * 1024 * 1024;
    mockGithubRequest.mockResolvedValueOnce(
      makeGitHubFile("small", "src/a.ts")
    );
    const huge = "x".repeat(Math.ceil(BUDGET) + 1);
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(huge, "src/b.ts"));

    const result = await getMultipleFiles("owner", "repo", ["src/a.ts", "src/b.ts", "src/c.ts"]);

    expect(result.files).toHaveLength(1);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe(1);
  });
});

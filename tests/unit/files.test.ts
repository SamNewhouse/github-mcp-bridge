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
  /**
   * Happy path — a normal file well within the 3.5 MB budget.
   * Asserts that content is correctly decoded from base64 and that
   * truncated is false with no fullSizeBytes field present.
   */
  it("returns decoded content and truncated: false for a normal file", async () => {
    const raw = "export const hello = 'world';";
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(raw));

    const result = await getFileContents("owner", "repo", "src/example.ts");

    expect(result.content).toBe(raw);
    expect(result.truncated).toBe(false);
    expect(result).not.toHaveProperty("fullSizeBytes");
  });

  /**
   * Budget enforcement — file content exceeds the 3.5 MB Vercel payload cap.
   * Asserts that content is sliced to the budget, truncated is true,
   * and fullSizeBytes / truncatedAt are present so the caller knows
   * how much was dropped.
   */
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

  /**
   * Type guard — GitHub returns a directory entry instead of a file
   * when the path points to a folder. Asserts that an AppError is thrown
   * with a message identifying the bad path.
   */
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

  /**
   * Encoding correctness — verifies the base64 decode + newline normalisation
   * round-trips cleanly for content containing special characters and newlines.
   */
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

  /**
   * Default pagination — 12 paths with the default pageSize of 10.
   * Asserts the first page returns exactly 10 files, hasMore is true,
   * nextCursor points to index 10, and total/returned/cursor are correct.
   */
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

  /**
   * Second page — same 12-path list resumed at cursor 10.
   * Asserts the remaining 2 files are returned, hasMore is false,
   * and nextCursor is null indicating no further pages.
   */
  it("returns remaining 2 files when cursor: 10 on a 12-file list", async () => {
    mockFiles(2);

    const result = await getMultipleFiles("owner", "repo", paths, undefined, 10);

    expect(result.files).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.cursor).toBe(10);
  });

  /**
   * Deduplication — 4 paths where each appears twice.
   * Asserts only 2 GitHub API calls are made and total reflects
   * the deduplicated count, not the original input length.
   */
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

  /**
   * Out-of-bounds cursor — cursor 999 on a single-file array.
   * Asserts an empty result is returned without making any API calls,
   * since the cursor is clamped to the array length.
   */
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

  /**
   * Custom pageSize — explicit pageSize: 3 on a 12-file list.
   * Asserts 3 files are returned, pageSize is reflected in pagination,
   * and nextCursor advances by 3.
   */
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

  /**
   * Mid-page budget stop — first file is small, second file alone exceeds
   * the 3.5 MB budget. Asserts that only the first file is returned,
   * hasMore is true, and nextCursor points to the oversized file so the
   * caller can resume from there on the next request.
   */
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

  /**
   * First-file budget guard — the very first file in the page already exceeds
   * the 3.5 MB budget by itself. Asserts it is still returned (to avoid an
   * infinite pagination loop where nothing would ever be yielded), hasMore is
   * true, and nextCursor points past it so subsequent pages can make progress.
   */
  it("includes the first file even when it alone exceeds the byte budget", async () => {
    const BUDGET = 3.5 * 1024 * 1024;
    const huge = "x".repeat(Math.ceil(BUDGET) + 1);
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(huge, "src/a.ts"));

    const result = await getMultipleFiles("owner", "repo", ["src/a.ts", "src/b.ts"]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe("src/a.ts");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe(1);
  });

  /**
   * ref forwarding — verifies that the ref argument is threaded through
   * to every underlying getFileContents call. Checks the URL passed to
   * githubRequest contains the encoded ref query param.
   */
  it("forwards ref to each getFileContents call", async () => {
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile("content", "src/a.ts"));

    await getMultipleFiles("owner", "repo", ["src/a.ts"], "my-branch");

    const calledUrl = (mockGithubRequest as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain("ref=my-branch");
  });

  /**
   * Cursor exactly at total — cursor set to the exact length of the path list.
   * Distinct from cursor > total: Math.min(cursor, total) returns total,
   * slice(total, total) is empty. Asserts no files and no API calls.
   */
  it("returns empty result when cursor equals total exactly", async () => {
    const singlePath = ["src/a.ts"];

    const result = await getMultipleFiles(
      "owner",
      "repo",
      singlePath,
      undefined,
      1 // cursor === total (1)
    );

    expect(result.files).toHaveLength(0);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  /**
   * Single file, fully consumed — 1-path list with default pageSize 10.
   * Asserts exactly 1 file is returned, hasMore is false, nextCursor is null,
   * and total and returned are both 1.
   */
  it("returns hasMore: false and nextCursor: null for a single file list", async () => {
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile("content", "src/a.ts"));

    const result = await getMultipleFiles("owner", "repo", ["src/a.ts"]);

    expect(result.files).toHaveLength(1);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.returned).toBe(1);
  });
});

import { Buffer } from "node:buffer";
import { AppError } from "../../src/lib/errors";

jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  getFileContents,
  getMultipleFiles,
  listDirectory,
  upsertFile,
  patchFile,
  deleteFile,
} from "../../src/github/files";

const mockGithubRequest = githubRequest as jest.MockedFunction<
  typeof githubRequest
>;

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

function makeDirectoryEntry(
  name: string,
  type: "file" | "dir" | "symlink" | "submodule" = "file"
) {
  return {
    type,
    name,
    path: `src/${name}`,
    sha: "sha-" + name,
    size: type === "dir" ? 0 : 100,
  };
}

beforeEach(() => {
  mockGithubRequest.mockReset();
});

/**
 * getFileContents
 *
 * Fetches a single file by path and decodes its base64 content. Enforces a
 * 3.5 MB budget matching the Vercel payload cap — files that exceed the limit
 * are sliced and returned with truncated: true plus fullSizeBytes and
 * truncatedAt metadata. Throws AppError when the path resolves to a directory.
 */
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

  /**
   * ref forwarded — when a ref is supplied it should appear as a query
   * param in the URL sent to githubRequest.
   */
  it("includes ref in the URL when supplied", async () => {
    const raw = "export default 1;";
    mockGithubRequest.mockResolvedValueOnce(makeGitHubFile(raw));

    await getFileContents("owner", "repo", "src/example.ts", "feat/my-branch");

    const url = (mockGithubRequest as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("ref=feat%2Fmy-branch");
  });
});

/**
 * getMultipleFiles
 *
 * Fetches a list of file paths in paginated batches. Deduplicates paths before
 * fetching and enforces a cumulative 3.5 MB budget — once the budget is
 * exceeded mid-page the current file is excluded and hasMore is set so the
 * caller can resume. Returns a pagination object with cursor, nextCursor,
 * hasMore, total, and returned counts.
 */
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
   * Out-of-bounds cursor — cursor equal to total.
   * Asserts 0 files are returned, hasMore is false, and no API call is made.
   */
  it("returns 0 files and hasMore: false when cursor equals total", async () => {
    const result = await getMultipleFiles("owner", "repo", ["src/a.ts"], undefined, 1);

    expect(result.files).toHaveLength(0);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
    expect(mockGithubRequest).not.toHaveBeenCalled();
  });

  /**
   * Budget stop mid-page — two files where the second alone would push
   * the total bytes over the 3.5 MB budget.
   * Asserts only the first file is returned, hasMore is true, and
   * nextCursor points to the second file's index so it can be resumed.
   */
  it("stops early and sets hasMore: true when cumulative budget is exceeded", async () => {
    const BUDGET = 3.5 * 1024 * 1024;
    const smallContent = "small";
    const bigContent = "x".repeat(Math.ceil(BUDGET) + 1);

    const threePaths = ["src/a.ts", "src/b.ts", "src/c.ts"];

    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile(smallContent, "src/a.ts"))
      .mockResolvedValueOnce(makeGitHubFile(bigContent, "src/b.ts"));

    const result = await getMultipleFiles("owner", "repo", threePaths);

    expect(result.files).toHaveLength(1);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBe(1);
  });
});

/**
 * listDirectory
 *
 * Lists the entries at a given repository path. Throws AppError when the path
 * points to a file (GitHub returns a plain object rather than an array).
 * An empty string path lists the repository root. Forwards an optional ref
 * as a query parameter.
 */
describe("listDirectory", () => {
  /**
   * Happy path — GitHub returns an array of entries for a directory.
   * Asserts the entries are mapped correctly with name, path, sha, size, type.
   */
  it("returns mapped directory entries", async () => {
    mockGithubRequest.mockResolvedValueOnce([
      makeDirectoryEntry("index.ts", "file"),
      makeDirectoryEntry("utils", "dir"),
    ]);

    const result = await listDirectory("owner", "repo", "src");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "index.ts",
      path: "src/index.ts",
      type: "file",
    });
    expect(result[1]).toMatchObject({
      name: "utils",
      type: "dir",
    });
  });

  /**
   * File path guard — GitHub returns a plain object (not an array) when
   * the path points to a file, not a directory. Asserts AppError is thrown
   * with a message identifying the bad path.
   */
  it("throws AppError when the path is a file not a directory", async () => {
    // GitHub returns a single object for files, not an array
    mockGithubRequest.mockResolvedValueOnce(
      makeGitHubFile("content", "src/index.ts")
    );

    await expect(
      listDirectory("owner", "repo", "src/index.ts")
    ).rejects.toThrow("Path is not a directory");
  });

  /**
   * Root path — calling with path="" lists the repo root.
   * Asserts the URL sent to githubRequest uses /contents (no trailing slash)
   * rather than /contents/ which would 404.
   */
  it("lists the repo root when path is empty", async () => {
    mockGithubRequest.mockResolvedValueOnce([
      makeDirectoryEntry("README.md", "file"),
    ]);

    await listDirectory("owner", "repo", "");

    const url = (mockGithubRequest as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/contents");
    expect(url).not.toContain("/contents/");
  });

  /**
   * ref forwarded — when a ref is supplied it should appear in the URL.
   */
  it("includes ref in the URL when supplied", async () => {
    mockGithubRequest.mockResolvedValueOnce([]);

    await listDirectory("owner", "repo", "src", "main");

    const url = (mockGithubRequest as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("ref=main");
  });

  /**
   * Empty directory — GitHub returns an empty array.
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array for an empty directory", async () => {
    mockGithubRequest.mockResolvedValueOnce([]);

    const result = await listDirectory("owner", "repo", "src");

    expect(result).toEqual([]);
  });
});

/**
 * upsertFile
 *
 * Creates or updates a file using the GitHub Contents PUT endpoint. Performs
 * a GET first to determine whether the file exists and to obtain its SHA for
 * updates. 404 on the GET indicates a new file (no sha in PUT body). Any
 * other error from the GET is re-thrown. Returns created: true/false and
 * the commit + file metadata from GitHub.
 */
describe("upsertFile", () => {
  const upsertInput = {
    path: "src/new-file.ts",
    content: "export const x = 1;",
    message: "chore: add new-file",
    branch: "main",
  };

  function makeUpsertResponse(sha = "new-sha") {
    return {
      content: {
        name: "new-file.ts",
        path: "src/new-file.ts",
        sha,
        size: 20,
      },
      commit: {
        sha: "commit-sha",
        html_url: "https://github.com/owner/repo/commit/commit-sha",
        message: "chore: add new-file",
      },
    };
  }

  /**
   * Create branch (file doesn't exist) — GET returns 404, so no SHA is
   * fetched, and the PUT body must not contain a sha field.
   * Asserts created: true is returned.
   */
  it("creates a new file and returns created: true when file does not exist", async () => {
    mockGithubRequest
      .mockRejectedValueOnce(new AppError("GitHub resource not found", 404)) // GET existing
      .mockResolvedValueOnce(makeUpsertResponse()); // PUT

    const result = await upsertFile("owner", "repo", upsertInput);

    expect(result.created).toBe(true);
    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("sha");
  });

  /**
   * Update branch (file exists) — GET returns the existing file with a sha.
   * Asserts the PUT body includes the existing sha and created: false is returned.
   */
  it("updates an existing file and returns created: false when file exists", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("old content", upsertInput.path)) // GET existing
      .mockResolvedValueOnce(makeUpsertResponse()); // PUT

    const result = await upsertFile("owner", "repo", upsertInput);

    expect(result.created).toBe(false);
    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    expect(body.sha).toBe("abc123"); // sha from makeGitHubFile
  });

  /**
   * Content base64-encoded — the PUT body must send content as a base64
   * string, not raw UTF-8 text. Asserts the encoded value round-trips
   * back to the original string.
   */
  it("base64-encodes the content in the PUT body", async () => {
    mockGithubRequest
      .mockRejectedValueOnce(new AppError("GitHub resource not found", 404))
      .mockResolvedValueOnce(makeUpsertResponse());

    await upsertFile("owner", "repo", upsertInput);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    expect(decoded).toBe(upsertInput.content);
  });

  /**
   * PUT method — asserts the upsert call uses the HTTP PUT method,
   * not POST, which is what the GitHub Contents API requires.
   */
  it("uses the PUT HTTP method", async () => {
    mockGithubRequest
      .mockRejectedValueOnce(new AppError("GitHub resource not found", 404))
      .mockResolvedValueOnce(makeUpsertResponse());

    await upsertFile("owner", "repo", upsertInput);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    expect(options.method).toBe("PUT");
  });

  /**
   * Return shape — asserts the mapped result contains file and commit
   * sub-objects with the expected fields.
   */
  it("returns file and commit fields in the response", async () => {
    mockGithubRequest
      .mockRejectedValueOnce(new AppError("GitHub resource not found", 404))
      .mockResolvedValueOnce(makeUpsertResponse());

    const result = await upsertFile("owner", "repo", upsertInput);

    expect(result.file).toMatchObject({
      name: "new-file.ts",
      path: "src/new-file.ts",
      sha: "new-sha",
    });
    expect(result.commit).toMatchObject({
      sha: "commit-sha",
      html_url: expect.stringContaining("github.com"),
      message: "chore: add new-file",
    });
  });

  /**
   * Non-404 GET error propagates — if the existence check fails with a
   * non-404 error (e.g. 401, 403, 500) the error must be re-thrown
   * rather than silently swallowed.
   */
  it("rethrows non-404 errors from the existence check", async () => {
    mockGithubRequest.mockRejectedValueOnce(
      new AppError("GitHub request forbidden", 403)
    );

    await expect(
      upsertFile("owner", "repo", upsertInput)
    ).rejects.toThrow("GitHub request forbidden");
  });
});

/**
 * deleteFile
 *
 * Deletes a file by first fetching its SHA (required by the GitHub Contents
 * DELETE endpoint) then issuing the DELETE. Throws AppError when the path
 * resolves to a directory rather than a file.
 */
describe("deleteFile", () => {
  const deleteInput = {
    path: "src/old-file.ts",
    branch: "main",
    message: "chore: remove old-file",
  };

  function makeDeleteResponse() {
    return {
      commit: {
        sha: "del-commit-sha",
        html_url: "https://github.com/owner/repo/commit/del-commit-sha",
        message: "chore: remove old-file",
      },
    };
  }

  /**
   * Happy path — file exists; asserts two API calls are made (GET sha, then
   * DELETE), deleted: true is returned, and the commit shape is correct.
   */
  it("returns deleted: true and commit detail when the file exists", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("content", deleteInput.path)) // GET sha
      .mockResolvedValueOnce(makeDeleteResponse()); // DELETE

    const result = await deleteFile("owner", "repo", deleteInput);

    expect(result.deleted).toBe(true);
    expect(result.path).toBe(deleteInput.path);
    expect(result.commit.sha).toBe("del-commit-sha");
    expect(mockGithubRequest).toHaveBeenCalledTimes(2);
  });

  /**
   * SHA forwarded — the DELETE body must include the sha obtained from the
   * GET call so GitHub can verify there are no concurrent modifications.
   */
  it("includes the file SHA in the DELETE body", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("content", deleteInput.path))
      .mockResolvedValueOnce(makeDeleteResponse());

    await deleteFile("owner", "repo", deleteInput);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    expect(body.sha).toBe("abc123"); // sha from makeGitHubFile
  });

  /**
   * DELETE HTTP method — asserts the second call uses the DELETE method,
   * not PUT or POST.
   */
  it("uses the DELETE HTTP method", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("content", deleteInput.path))
      .mockResolvedValueOnce(makeDeleteResponse());

    await deleteFile("owner", "repo", deleteInput);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    expect(options.method).toBe("DELETE");
  });

  /**
   * Path is a directory — GitHub returns an object with type: "dir".
   * Asserts AppError is thrown and no DELETE call is made.
   */
  it("throws AppError when the path resolves to a directory", async () => {
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
      deleteFile("owner", "repo", deleteInput)
    ).rejects.toThrow("Path is not a file");

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
  });
});

/**
 * patchFile
 *
 * Applies a series of text-based patch operations (replace_once, replace_all,
 * insert_before, insert_after) to an existing file's content, then writes the
 * result back via a PUT. Throws AppError for binary files (null byte detected),
 * and for replace_once when the find text is not present. Includes the file's
 * existing SHA in the PUT body to guard against concurrent modifications.
 */
describe("patchFile", () => {
  const patchInput = {
    path: "src/config.ts",
    branch: "main",
    message: "fix: update config",
    patches: [{ op: "replace_once" as const, find: "old text", replace: "new text" }],
  };

  function makePatchResponse() {
    return {
      content: {
        name: "config.ts",
        path: "src/config.ts",
        sha: "patched-sha",
        size: 50,
      },
      commit: {
        sha: "patch-commit-sha",
        html_url: "https://github.com/owner/repo/commit/patch-commit-sha",
        message: "fix: update config",
      },
    };
  }

  /**
   * Happy path (replace_once) — file exists, patch text is found.
   * Asserts patched: true is returned, patchesApplied matches the input
   * count, and the PUT body contains the updated content base64-encoded.
   */
  it("returns patched: true and applies replace_once correctly", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("old text here", patchInput.path))
      .mockResolvedValueOnce(makePatchResponse());

    const result = await patchFile("owner", "repo", patchInput);

    expect(result.patched).toBe(true);
    expect(result.patchesApplied).toBe(1);
    expect(result.path).toBe(patchInput.path);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    expect(decoded).toBe("new text here");
  });

  /**
   * replace_all op — all occurrences of the find text are replaced.
   * Asserts the decoded PUT body has both instances replaced.
   */
  it("replaces all occurrences with replace_all op", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("foo foo foo", patchInput.path))
      .mockResolvedValueOnce(makePatchResponse());

    await patchFile("owner", "repo", {
      ...patchInput,
      patches: [{ op: "replace_all", find: "foo", replace: "bar" }],
    });

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    expect(decoded).toBe("bar bar bar");
  });

  /**
   * insert_before op — content is inserted immediately before the anchor.
   * Asserts the decoded PUT body has the content prepended to the anchor.
   */
  it("inserts content before the anchor with insert_before op", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("anchor line", patchInput.path))
      .mockResolvedValueOnce(makePatchResponse());

    await patchFile("owner", "repo", {
      ...patchInput,
      patches: [{ op: "insert_before", anchor: "anchor line", content: "before\n" }],
    });

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    expect(decoded).toBe("before\nanchor line");
  });

  /**
   * insert_after op — content is appended immediately after the anchor.
   */
  it("inserts content after the anchor with insert_after op", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("anchor line", patchInput.path))
      .mockResolvedValueOnce(makePatchResponse());

    await patchFile("owner", "repo", {
      ...patchInput,
      patches: [{ op: "insert_after", anchor: "anchor line", content: "\nafter" }],
    });

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    expect(decoded).toBe("anchor line\nafter");
  });

  /**
   * find text not found (replace_once) — the patch text doesn't exist in
   * the file. Asserts AppError is thrown with a descriptive message and
   * no PUT call is made.
   */
  it("throws AppError when replace_once find text is not found", async () => {
    mockGithubRequest.mockResolvedValueOnce(
      makeGitHubFile("completely different content", patchInput.path)
    );

    await expect(
      patchFile("owner", "repo", patchInput)
    ).rejects.toThrow("replace_once");

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
  });

  /**
   * Binary file guard — decoded content contains a null byte.
   * Asserts AppError is thrown refusing to patch binary content.
   */
  it("throws AppError when the file content contains a null byte (binary guard)", async () => {
    const binaryContent = "text\0binary";
    mockGithubRequest.mockResolvedValueOnce(
      makeGitHubFile(binaryContent, patchInput.path)
    );

    await expect(
      patchFile("owner", "repo", patchInput)
    ).rejects.toThrow("binary file");

    expect(mockGithubRequest).toHaveBeenCalledTimes(1);
  });

  /**
   * SHA forwarded — the PUT body must include the existing file's SHA so
   * GitHub can detect concurrent modifications.
   */
  it("includes the existing file SHA in the PUT body", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("old text", patchInput.path))
      .mockResolvedValueOnce(makePatchResponse());

    await patchFile("owner", "repo", patchInput);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    expect(body.sha).toBe("abc123"); // sha from makeGitHubFile
  });

  /**
   * Multiple patches applied in order — two sequential replace_once ops.
   * Asserts patchesApplied is 2 and both substitutions are in the PUT body.
   */
  it("applies multiple patches in sequence and returns correct patchesApplied count", async () => {
    mockGithubRequest
      .mockResolvedValueOnce(makeGitHubFile("aaa bbb", patchInput.path))
      .mockResolvedValueOnce(makePatchResponse());

    const result = await patchFile("owner", "repo", {
      ...patchInput,
      patches: [
        { op: "replace_once", find: "aaa", replace: "AAA" },
        { op: "replace_once", find: "bbb", replace: "BBB" },
      ],
    });

    expect(result.patchesApplied).toBe(2);

    const [, options] = (mockGithubRequest as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    expect(decoded).toBe("AAA BBB");
  });
});

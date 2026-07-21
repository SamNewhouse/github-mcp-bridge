jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import { searchCode, searchFiles } from "../../src/github/search";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

function makeTree(paths: string[]) {
  return {
    sha: "treesha",
    url: "https://api.github.com/repos/owner/repo/git/trees/HEAD",
    truncated: false,
    tree: paths.map((p) => ({ path: p, type: "blob", sha: "filesha", url: "" })),
  };
}

// ---------------------------------------------------------------------------
// searchFiles
// ---------------------------------------------------------------------------
describe("searchFiles", () => {
  /**
   * Pattern matching — only paths containing the pattern should be returned.
   * Asserts that files not matching the pattern are excluded.
   */
  it("returns only files whose paths contain the pattern", async () => {
    mock.mockResolvedValueOnce(
      makeTree(["src/github/files.ts", "src/lib/validation.ts", "README.md"])
    );

    const result = await searchFiles("owner", "repo", "github");

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe("src/github/files.ts");
    expect(result.total_matched).toBe(1);
  });

  /**
   * Case-insensitive matching — pattern "GITHUB" should match "src/github/files.ts".
   * Asserts the filter lowercases both sides before comparing.
   */
  it("matches paths case-insensitively", async () => {
    mock.mockResolvedValueOnce(makeTree(["src/GitHub/Files.ts", "README.md"]));

    const result = await searchFiles("owner", "repo", "github");

    expect(result.total_matched).toBe(1);
  });

  /**
   * Directories excluded — pattern present in tree but only as type: tree.
   * Asserts directories are excluded; only blobs are matched.
   */
  it("excludes directories from results", async () => {
    mock.mockResolvedValueOnce({
      sha: "treesha",
      url: "",
      truncated: false,
      tree: [
        { path: "src/github", type: "tree", sha: "dirsha", url: "" },
        { path: "src/github/files.ts", type: "blob", sha: "filesha", url: "" },
      ],
    });

    const result = await searchFiles("owner", "repo", "github");

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe("src/github/files.ts");
  });

  /**
   * Truncated tree — GitHub returns truncated: true when the repo has > 100k objects.
   * Asserts truncated is propagated to the caller so they know results may be incomplete.
   */
  it("propagates truncated: true from the GitHub response", async () => {
    mock.mockResolvedValueOnce({
      sha: "treesha",
      url: "",
      truncated: true,
      tree: [{ path: "src/github/files.ts", type: "blob", sha: "s", url: "" }],
    });

    const result = await searchFiles("owner", "repo", "github");

    expect(result.truncated).toBe(true);
  });

  /**
   * No matches — pattern that doesn't exist in any path.
   * Asserts empty files array and total_matched of 0 are returned.
   */
  it("returns empty result when no paths match the pattern", async () => {
    mock.mockResolvedValueOnce(makeTree(["src/foo.ts", "README.md"]));

    const result = await searchFiles("owner", "repo", "nonexistent");

    expect(result.files).toHaveLength(0);
    expect(result.total_matched).toBe(0);
  });

  /**
   * ref defaulting — no ref supplied. Asserts the URL contains HEAD
   * (the default) rather than undefined or an empty string.
   */
  it("uses HEAD as the default ref when none is provided", async () => {
    mock.mockResolvedValueOnce(makeTree([]));

    await searchFiles("owner", "repo", "pattern");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/HEAD?");
  });

  /**
   * ref forwarding — explicit ref: "feat/pagination".
   * Asserts the URL uses the supplied ref instead of HEAD.
   */
  it("uses the supplied ref in the URL when provided", async () => {
    mock.mockResolvedValueOnce(makeTree([]));

    await searchFiles("owner", "repo", "pattern", "feat/pagination");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/feat/pagination?");
  });
});

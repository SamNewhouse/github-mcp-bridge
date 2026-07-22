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
    tree: paths.map((p) => ({
      path: p,
      type: "blob",
      sha: "filesha",
      url: "",
    })),
  };
}

function makeCodeSearchResult(items: { path: string; name: string }[]) {
  return {
    total_count: items.length,
    incomplete_results: false,
    items: items.map((item) => ({
      name: item.name,
      path: item.path,
      sha: "filesha",
      url: "https://api.github.com/repos/owner/repo/contents/" + item.path,
      html_url: "https://github.com/owner/repo/blob/main/" + item.path,
      repository: { full_name: "owner/repo" },
      text_matches: [
        {
          fragment: "matching fragment",
          matches: [{ text: "query", indices: [0, 5] }],
        },
      ],
    })),
  };
}

/**
 * searchCode
 *
 * Uses the GitHub code search API to find files containing a query string
 * within a specific repository. The query is automatically scoped with
 * repo:owner/repo. text_matches fragments are flattened to an array of
 * strings for each result item. Returns total_count, incomplete_results,
 * and a mapped items array.
 */
describe("searchCode", () => {
  /**
   * Happy path — returns mapped items with matches flattened to fragment strings.
   * Asserts total_count, incomplete_results, and per-item fields are present.
   */
  it("returns mapped items with fragments from text_matches", async () => {
    mock.mockResolvedValueOnce(
      makeCodeSearchResult([{ path: "src/github/files.ts", name: "files.ts" }]),
    );

    const result = await searchCode("owner", "repo", "githubRequest");

    expect(result.total_count).toBe(1);
    expect(result.incomplete_results).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: "files.ts",
      path: "src/github/files.ts",
      repository: "owner/repo",
    });
    expect(result.items[0]!.matches).toEqual(["matching fragment"]);
  });

  /**
   * No text_matches — GitHub omits text_matches when the Accept header
   * for text-match+json is not honoured. Asserts matches defaults to []
   * rather than throwing on undefined.
   */
  it("returns matches: [] when text_matches is absent", async () => {
    const raw = makeCodeSearchResult([{ path: "src/foo.ts", name: "foo.ts" }]);
    delete (raw.items[0] as any).text_matches;
    mock.mockResolvedValueOnce(raw);

    const result = await searchCode("owner", "repo", "foo");

    expect(result.items[0]!.matches).toEqual([]);
  });

  /**
   * Query scoped to repo — the URL must include the repo:owner/repo scope
   * so results are confined to the target repository.
   */
  it("scopes the search query to the target repository", async () => {
    mock.mockResolvedValueOnce(makeCodeSearchResult([]));

    await searchCode("owner", "repo", "my query");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain("repo:owner/repo");
  });

  /**
   * Empty results — query matches nothing.
   * Asserts items is an empty array and total_count is 0.
   */
  it("returns empty items when no results are found", async () => {
    mock.mockResolvedValueOnce(makeCodeSearchResult([]));

    const result = await searchCode("owner", "repo", "nonexistent");

    expect(result.items).toEqual([]);
    expect(result.total_count).toBe(0);
  });
});

/**
 * searchFiles
 *
 * Searches the full git tree for files whose paths contain the given pattern
 * (case-insensitive). Uses the recursive git trees API rather than the code
 * search API, so there are no rate-limit concerns. Directories are excluded
 * from results. Propagates the truncated flag from GitHub when the tree
 * exceeds the API's object limit.
 */
describe("searchFiles", () => {
  /**
   * Pattern matching — only paths containing the pattern should be returned.
   * Asserts that files not matching the pattern are excluded.
   */
  it("returns only files whose paths contain the pattern", async () => {
    mock.mockResolvedValueOnce(
      makeTree(["src/github/files.ts", "src/lib/validation.ts", "README.md"]),
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

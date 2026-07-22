jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import { getCommit, listCommits } from "../../src/github/commits";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

function makeCommitDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sha: "deadbeef",
    html_url: "https://github.com/commit/deadbeef",
    commit: {
      message: "fix: correct bug",
      author: { name: "Alice", email: "alice@example.com", date: "2026-01-01T00:00:00Z" },
      committer: { name: "Alice", date: "2026-01-01T00:00:00Z" },
    },
    author: { login: "alice" },
    stats: { additions: 5, deletions: 2, total: 7 },
    files: [
      {
        filename: "src/foo.ts",
        status: "modified",
        additions: 5,
        deletions: 2,
        changes: 7,
        patch: "@@ ...",
      },
    ],
    ...overrides,
  };
}

function makeCommitSummary(sha: string) {
  return {
    sha,
    html_url: `https://github.com/commit/${sha}`,
    commit: {
      message: `commit ${sha}`,
      author: { name: "Alice", date: "2026-01-01T00:00:00Z" },
    },
    author: { login: "alice" },
  };
}

/**
 * getCommit
 *
 * Fetches a single commit by SHA or ref and maps the GitHub response to a
 * flat structure. Handles absent stats, absent files, null author (unlinked
 * GitHub account), and null patch (binary files).
 */
describe("getCommit", () => {
  /**
   * Happy path — returns all top-level fields including stats and files array.
   * Asserts author_login comes from the outer author object (not commit.author.name).
   */
  it("returns stats and files with correct field mappings", async () => {
    mock.mockResolvedValueOnce(makeCommitDetail());

    const result = await getCommit("owner", "repo", "deadbeef");

    expect(result.sha).toBe("deadbeef");
    expect(result.author_login).toBe("alice");
    expect(result.stats).toEqual({ additions: 5, deletions: 2, total: 7 });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe("src/foo.ts");
    expect(result.files[0]!.patch).toBe("@@ ...");
  });

  /**
   * Null author_login — commit was made without a linked GitHub account
   * (e.g. via the git CLI with a non-GitHub email). Asserts author_login
   * is null rather than throwing on the missing .login property.
   */
  it("returns author_login: null when commit has no linked GitHub account", async () => {
    mock.mockResolvedValueOnce(makeCommitDetail({ author: null }));

    const result = await getCommit("owner", "repo", "deadbeef");

    expect(result.author_login).toBeNull();
  });

  /**
   * Missing stats — GitHub omits stats on some commit endpoints.
   * Asserts stats is null (not undefined or throwing) in the mapped output.
   */
  it("returns stats: null when GitHub response omits stats", async () => {
    const detail = makeCommitDetail();
    delete (detail as any).stats;
    mock.mockResolvedValueOnce(detail);

    const result = await getCommit("owner", "repo", "deadbeef");

    expect(result.stats).toBeNull();
  });

  /**
   * Missing files — GitHub may omit the files array on tree commits.
   * Asserts files defaults to an empty array rather than undefined.
   */
  it("returns files: [] when GitHub response omits files", async () => {
    const detail = makeCommitDetail();
    delete (detail as any).files;
    mock.mockResolvedValueOnce(detail);

    const result = await getCommit("owner", "repo", "deadbeef");

    expect(result.files).toEqual([]);
  });

  /**
   * Null patch — binary files have no patch in the GitHub response.
   * Asserts patch is mapped to null rather than undefined.
   */
  it("maps missing patch to null for binary files", async () => {
    const detail = makeCommitDetail();
    delete (detail as any).files[0].patch;
    mock.mockResolvedValueOnce(detail);

    const result = await getCommit("owner", "repo", "deadbeef");

    expect(result.files[0]!.patch).toBeNull();
  });
});

/**
 * listCommits
 *
 * Lists commits for a repository with optional branch, path, and perPage
 * filters. Each filter is forwarded as a query parameter on the GitHub API
 * URL. Handles unlinked GitHub accounts (null author_login).
 */
describe("listCommits", () => {
  /**
   * Default per_page — calling with no arguments.
   * Asserts per_page=30 appears in the URL (the documented default).
   */
  it("uses per_page=30 as the default", async () => {
    mock.mockResolvedValueOnce([]);

    await listCommits("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=30");
  });

  /**
   * Branch filter — passing a branch name should set sha= in the URL.
   * Asserts the URL forwarded to githubRequest contains sha=<branch>.
   */
  it("forwards branch as sha param in the URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listCommits("owner", "repo", "feat/pagination");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("sha=feat%2Fpagination");
  });

  /**
   * Path filter — passing a path should add path= to the URL.
   * Asserts the URL contains the encoded path parameter.
   */
  it("forwards path filter in the URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listCommits("owner", "repo", undefined, "src/github/files.ts");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("path=src%2Fgithub%2Ffiles.ts");
  });

  /**
   * perPage forwarding — custom perPage of 5.
   * Asserts per_page=5 appears in the URL.
   */
  it("forwards perPage as per_page in the URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listCommits("owner", "repo", undefined, undefined, 5);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=5");
  });

  /**
   * author_login null — commit without a linked GitHub account.
   * Asserts author_login is null rather than throwing on missing .login.
   */
  it("returns author_login: null for commits without a linked GitHub account", async () => {
    mock.mockResolvedValueOnce([
      { ...makeCommitSummary("abc"), author: null },
    ]);

    const [commit] = await listCommits("owner", "repo");

    expect(commit!.author_login).toBeNull();
  });
});

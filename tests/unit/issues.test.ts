// Mock the GitHub client before importing modules under test
jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  linkIssueToPullRequest,
  listIssueComments,
  addIssueComment,
} from "../../src/github/issues";
import {
  listOpenPullRequests,
  getPullRequest,
  listPullRequestFiles,
  updatePullRequest,
} from "../../src/github/pull-requests";
import {
  listBranches,
  createBranch,
  getBranch,
} from "../../src/github/branches";
import { getCommit, listCommits } from "../../src/github/commits";
import { searchCode, searchFiles } from "../../src/github/search";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

// ---------------------------------------------------------------------------
// Shared builders
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    number: 1,
    title: "Test issue",
    body: "Body text",
    state: "open",
    html_url: "https://github.com/owner/repo/issues/1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    user: { login: "alice" },
    labels: [{ name: "bug", color: "d73a4a" }],
    assignees: [{ login: "bob" }],
    comments: 2,
    ...overrides,
  };
}

function makePR(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    number: 10,
    title: "Test PR",
    body: "PR body",
    state: "open",
    draft: false,
    html_url: "https://github.com/owner/repo/pull/10",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    user: { login: "alice" },
    head: { ref: "feat/foo", sha: "deadbeef" },
    base: { ref: "main" },
    mergeable: true,
    additions: 10,
    deletions: 2,
    changed_files: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listIssues
// ---------------------------------------------------------------------------
describe("listIssues", () => {
  /**
   * PR filtering — GitHub's /issues endpoint returns both issues and PRs;
   * pull requests carry a pull_request field. Asserts they are stripped
   * from the returned array so only true issues remain.
   */
  it("filters out pull requests from the response", async () => {
    mock.mockResolvedValueOnce([
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, pull_request: { url: "..." } }),
      makeIssue({ number: 3 }),
    ]);

    const result = await listIssues("owner", "repo");

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.number)).toEqual([1, 3]);
  });

  /**
   * State default — calling listIssues without a state argument.
   * Asserts the URL passed to githubRequest contains state=open,
   * confirming the default is applied and forwarded correctly.
   */
  it("defaults to state=open in the GitHub API URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listIssues("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("state=open");
  });

  /**
   * State forwarding — calling with state: "all".
   * Asserts the URL contains state=all so the parameter is
   * threaded through correctly for each valid enum value.
   */
  it("forwards state=all to the GitHub API URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listIssues("owner", "repo", "all");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("state=all");
  });

  /**
   * Return shape — verifies the mapped output fields are correct.
   * Asserts labels and assignees are flattened to string arrays
   * and all expected top-level keys are present.
   */
  it("maps labels and assignees to string arrays", async () => {
    mock.mockResolvedValueOnce([makeIssue()]);

    const [issue] = await listIssues("owner", "repo");

    expect(issue!.labels).toEqual(["bug"]);
    expect(issue!.assignees).toEqual(["bob"]);
    expect(issue!).toHaveProperty("author", "alice");
  });
});

// ---------------------------------------------------------------------------
// getIssue
// ---------------------------------------------------------------------------
describe("getIssue", () => {
  /**
   * PR guard — GitHub returns issue-like data for PR numbers on the /issues
   * endpoint; the pull_request key signals this. Asserts an AppError is thrown
   * with a message distinguishing it from a genuine issue lookup error.
   */
  it("throws AppError when the number belongs to a pull request", async () => {
    mock.mockResolvedValueOnce(makeIssue({ pull_request: { url: "..." } }));

    await expect(getIssue("owner", "repo", 1)).rejects.toThrow(
      "Requested number is a pull request, not an issue"
    );
  });

  /**
   * Happy path — returns correct shape including body.
   * Asserts body is present (unlike listIssues which omits it)
   * and all label/assignee mappings are applied.
   */
  it("returns full issue including body for a valid issue number", async () => {
    mock.mockResolvedValueOnce(makeIssue());

    const result = await getIssue("owner", "repo", 1);

    expect(result.body).toBe("Body text");
    expect(result.number).toBe(1);
    expect(result.labels).toEqual(["bug"]);
  });

  /**
   * Null body — GitHub can return null body for issues with no description.
   * Asserts null is preserved in the mapped output rather than coerced.
   */
  it("preserves null body when issue has no description", async () => {
    mock.mockResolvedValueOnce(makeIssue({ body: null }));

    const result = await getIssue("owner", "repo", 1);

    expect(result.body).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateIssue
// ---------------------------------------------------------------------------
describe("updateIssue", () => {
  /**
   * Empty payload guard — updateIssue checks that at least one field is
   * provided before calling the GitHub PATCH endpoint. Asserts AppError
   * is thrown and no API call is made.
   */
  it("throws AppError when no update fields are provided", async () => {
    await expect(updateIssue("owner", "repo", 1, {})).rejects.toThrow(
      "No update fields provided"
    );
    expect(mock).not.toHaveBeenCalled();
  });

  /**
   * Partial update — only title is supplied.
   * Asserts the PATCH body contains only title (not body/state/etc.)
   * so irrelevant fields aren't inadvertently cleared.
   */
  it("sends only the supplied fields in the PATCH body", async () => {
    mock.mockResolvedValueOnce(makeIssue({ title: "Updated" }));

    await updateIssue("owner", "repo", 1, { title: "Updated" });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ title: "Updated" });
    expect(body).not.toHaveProperty("state");
  });

  /**
   * All fields update — every optional field is supplied.
   * Asserts all five fields (title, body, state, labels, assignees)
   * appear in the PATCH body.
   */
  it("includes all fields in the PATCH body when all are provided", async () => {
    mock.mockResolvedValueOnce(makeIssue());

    await updateIssue("owner", "repo", 1, {
      title: "T",
      body: "B",
      state: "closed",
      labels: ["bug"],
      assignees: ["alice"],
    });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      title: "T",
      body: "B",
      state: "closed",
      labels: ["bug"],
      assignees: ["alice"],
    });
  });
});

// ---------------------------------------------------------------------------
// linkIssueToPullRequest
// ---------------------------------------------------------------------------
describe("linkIssueToPullRequest", () => {
  /**
   * Not yet linked — PR body doesn't contain any closing keyword for issue #5.
   * Asserts the PATCH is called with the appended text and linked: true is returned.
   */
  it("appends keyword and returns linked: true when issue is not yet referenced", async () => {
    mock
      .mockResolvedValueOnce({ number: 10, body: "Some description" }) // GET PR
      .mockResolvedValueOnce({}); // PATCH PR

    const result = await linkIssueToPullRequest("owner", "repo", 10, 5);

    expect(result.linked).toBe(true);
    expect(result.keyword).toBe("closes"); // default keyword
    const patchBody = JSON.parse((mock as jest.Mock).mock.calls[1][1].body);
    expect(patchBody.body).toContain("closes #5");
  });

  /**
   * Already linked (exact case) — PR body already contains "closes #5".
   * Asserts no PATCH is made and linked: false with a reason is returned,
   * making the operation idempotent.
   */
  it("returns linked: false and skips PATCH when issue is already referenced", async () => {
    mock.mockResolvedValueOnce({
      number: 10,
      body: "closes #5",
    });

    const result = await linkIssueToPullRequest("owner", "repo", 10, 5);

    expect(result.linked).toBe(false);
    expect(result).toHaveProperty("reason");
    expect(mock).toHaveBeenCalledTimes(1); // only the GET, no PATCH
  });

  /**
   * Already linked (mixed case) — PR body contains "Closes #5" with a capital C.
   * Asserts the regex match is case-insensitive so duplicates aren't appended
   * regardless of the casing used in the original PR body.
   */
  it("returns linked: false when issue is already referenced with different casing", async () => {
    mock.mockResolvedValueOnce({ number: 10, body: "Closes #5" });

    const result = await linkIssueToPullRequest("owner", "repo", 10, 5);

    expect(result.linked).toBe(false);
  });

  /**
   * Keyword variants — uses keyword: "fixes".
   * Asserts the PATCH body contains "fixes #5" (not "closes"),
   * confirming keyword is forwarded correctly.
   */
  it("uses the supplied keyword in the appended text", async () => {
    mock
      .mockResolvedValueOnce({ number: 10, body: "" })
      .mockResolvedValueOnce({});

    await linkIssueToPullRequest("owner", "repo", 10, 5, "fixes");

    const patchBody = JSON.parse((mock as jest.Mock).mock.calls[1][1].body);
    expect(patchBody.body).toContain("fixes #5");
  });

  /**
   * Null PR body — GitHub may return null body for PRs with no description.
   * Asserts the PATCH body is constructed from an empty string rather than
   * "null #5", preventing a malformed PR body.
   */
  it("treats a null PR body as empty string when appending", async () => {
    mock
      .mockResolvedValueOnce({ number: 10, body: null })
      .mockResolvedValueOnce({});

    await linkIssueToPullRequest("owner", "repo", 10, 5);

    const patchBody = JSON.parse((mock as jest.Mock).mock.calls[1][1].body);
    expect(patchBody.body).toMatch(/^\s*closes #5/);
    expect(patchBody.body).not.toContain("null");
  });

  /**
   * "resolves" keyword — third valid keyword value.
   * Asserts the PATCH body contains "resolves #5",
   * covering all three keyword variants.
   */
  it("supports the 'resolves' keyword", async () => {
    mock
      .mockResolvedValueOnce({ number: 10, body: "" })
      .mockResolvedValueOnce({});

    await linkIssueToPullRequest("owner", "repo", 10, 5, "resolves");

    const patchBody = JSON.parse((mock as jest.Mock).mock.calls[1][1].body);
    expect(patchBody.body).toContain("resolves #5");
  });
});

// ---------------------------------------------------------------------------
// updatePullRequest
// ---------------------------------------------------------------------------
describe("updatePullRequest", () => {
  /**
   * Empty payload guard — mirrors updateIssue behaviour.
   * Asserts AppError is thrown when no fields are supplied
   * and the GitHub PATCH endpoint is never called.
   */
  it("throws AppError when no update fields are provided", async () => {
    await expect(updatePullRequest("owner", "repo", 10, {})).rejects.toThrow(
      "No update fields provided"
    );
    expect(mock).not.toHaveBeenCalled();
  });

  /**
   * Partial update (body only) — only body is supplied.
   * Asserts the PATCH body contains only body and that
   * title/base/state are absent so they aren't inadvertently reset.
   */
  it("sends only the supplied fields in the PATCH body", async () => {
    mock.mockResolvedValueOnce(makePR({ body: "New body" }));

    await updatePullRequest("owner", "repo", 10, { body: "New body" });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ body: "New body" });
    expect(body).not.toHaveProperty("title");
    expect(body).not.toHaveProperty("state");
  });

  /**
   * draft defaults to false — GitHub may return undefined for draft on older PRs.
   * Asserts the mapped result has draft: false (not undefined)
   * because mapPullRequest applies the ?? false fallback.
   */
  it("defaults draft to false when GitHub response omits the field", async () => {
    mock.mockResolvedValueOnce({ ...makePR(), draft: undefined });

    const result = await updatePullRequest("owner", "repo", 10, { title: "T" });

    expect(result.draft).toBe(false);
  });

  /**
   * mergeable null coercion — GitHub returns null while the merge check
   * is still pending. Asserts the mapped result preserves null
   * (not coerced to false or undefined).
   */
  it("preserves mergeable: null when GitHub returns null", async () => {
    mock.mockResolvedValueOnce({ ...makePR(), mergeable: null });

    const result = await updatePullRequest("owner", "repo", 10, { title: "T" });

    expect(result.mergeable).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPullRequestFiles
// ---------------------------------------------------------------------------
describe("listPullRequestFiles", () => {
  function makeFile(filename: string) {
    return {
      filename,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: "@@ ...",
      blob_url: "https://github.com/blob",
      raw_url: "https://github.com/raw",
    };
  }

  /**
   * truncated: false — GitHub returns 3 files (well under the 100-file cap).
   * Asserts truncated is false and all files are mapped correctly.
   */
  it("returns truncated: false when fewer than 100 files are returned", async () => {
    mock.mockResolvedValueOnce([
      makeFile("a.ts"),
      makeFile("b.ts"),
      makeFile("c.ts"),
    ]);

    const result = await listPullRequestFiles("owner", "repo", 10);

    expect(result.truncated).toBe(false);
    expect(result.files).toHaveLength(3);
  });

  /**
   * truncated: true — GitHub returns exactly 100 files (the per_page cap).
   * The implementation treats exactly-100 as potentially truncated because
   * GitHub caps per_page at 100 and won't paginate this endpoint.
   * Asserts truncated: true so callers know the list may be incomplete.
   */
  it("returns truncated: true when exactly 100 files are returned", async () => {
    mock.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => makeFile(`file-${i}.ts`)));

    const result = await listPullRequestFiles("owner", "repo", 10);

    expect(result.truncated).toBe(true);
    expect(result.files).toHaveLength(100);
  });

  /**
   * patch nullable — GitHub omits patch for binary files.
   * Asserts patch is normalised to null (not undefined) in the mapped output.
   */
  it("maps missing patch to null", async () => {
    const file = { ...makeFile("image.png") };
    delete (file as any).patch;
    mock.mockResolvedValueOnce([file]);

    const result = await listPullRequestFiles("owner", "repo", 10);

    expect(result.files[0]!.patch).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createBranch
// ---------------------------------------------------------------------------
describe("createBranch", () => {
  /**
   * Happy path — base branch exists; asserts the new branch name and
   * the base branch's SHA are returned, and that two API calls are made:
   * one GET to resolve the base SHA, one POST to create the ref.
   */
  it("returns the new branch name and SHA from the base branch", async () => {
    mock
      .mockResolvedValueOnce({ name: "main", commit: { sha: "abc123" }, protected: false }) // GET base
      .mockResolvedValueOnce({}); // POST ref

    const result = await createBranch("owner", "repo", "main", "feat/new");

    expect(result.name).toBe("feat/new");
    expect(result.sha).toBe("abc123");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  /**
   * Correct ref format — the POST body must include the full refs/heads/ prefix.
   * Asserts the body sent to the git/refs endpoint is correctly formed.
   */
  it("sends refs/heads/<name> format in the POST body", async () => {
    mock
      .mockResolvedValueOnce({ name: "main", commit: { sha: "sha1" }, protected: false })
      .mockResolvedValueOnce({});

    await createBranch("owner", "repo", "main", "feat/my-feature");

    const [, options] = (mock as jest.Mock).mock.calls[1];
    const body = JSON.parse(options.body);
    expect(body.ref).toBe("refs/heads/feat/my-feature");
    expect(body.sha).toBe("sha1");
  });
});

// ---------------------------------------------------------------------------
// getBranch
// ---------------------------------------------------------------------------
describe("getBranch", () => {
  /**
   * Happy path — returns structured detail including latest_commit.
   * Asserts all fields are correctly extracted from the nested GitHub response.
   */
  it("returns branch detail with latest_commit fields", async () => {
    mock.mockResolvedValueOnce({
      name: "main",
      commit: {
        sha: "abc123",
        html_url: "https://github.com/commit/abc123",
        commit: {
          message: "Initial commit",
          author: { name: "Alice", date: "2026-01-01T00:00:00Z" },
        },
      },
      protected: true,
    });

    const result = await getBranch("owner", "repo", "main");

    expect(result.name).toBe("main");
    expect(result.sha).toBe("abc123");
    expect(result.protected).toBe(true);
    expect(result.latest_commit.message).toBe("Initial commit");
    expect(result.latest_commit.author).toBe("Alice");
    expect(result.latest_commit.date).toBe("2026-01-01T00:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// getCommit
// ---------------------------------------------------------------------------
describe("getCommit", () => {
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

// ---------------------------------------------------------------------------
// listCommits
// ---------------------------------------------------------------------------
describe("listCommits", () => {
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

// ---------------------------------------------------------------------------
// searchFiles
// ---------------------------------------------------------------------------
describe("searchFiles", () => {
  function makeTree(paths: string[]) {
    return {
      sha: "treesha",
      url: "https://api.github.com/repos/owner/repo/git/trees/HEAD",
      truncated: false,
      tree: paths.map((p) => ({ path: p, type: "blob", sha: "filesha", url: "" })),
    };
  }

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
   * No matches — pattern present in tree but only in directories (type: tree).
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

    // Only the blob should match, not the directory
    expect(result.files.every((f) => !f.path.endsWith(""))).toBe(true);
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

// ---------------------------------------------------------------------------
// listIssueComments
// ---------------------------------------------------------------------------
describe("listIssueComments", () => {
  /**
   * Return shape — verifies each comment has the expected mapped fields.
   */
  it("maps comment fields correctly", async () => {
    mock.mockResolvedValueOnce([
      {
        id: 42,
        body: "LGTM",
        html_url: "https://github.com/issues/1#comment-42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        user: { login: "alice" },
      },
    ]);

    const result = await listIssueComments("owner", "repo", 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 42,
      body: "LGTM",
      author: "alice",
    });
  });

  /**
   * Empty list — issue exists but has no comments.
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array when there are no comments", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await listIssueComments("owner", "repo", 1);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addIssueComment
// ---------------------------------------------------------------------------
describe("addIssueComment", () => {
  /**
   * Happy path — asserts the correct POST body is sent and the returned
   * comment has the expected shape including id and html_url.
   */
  it("posts the comment body and returns the created comment", async () => {
    mock.mockResolvedValueOnce({
      id: 99,
      body: "Hello!",
      html_url: "https://github.com/issues/1#comment-99",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      user: { login: "alice" },
    });

    const result = await addIssueComment("owner", "repo", 1, "Hello!");

    const [, options] = (mock as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ body: "Hello!" });
    expect(result.id).toBe(99);
    expect(result.author).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------
describe("createIssue", () => {
  /**
   * Minimal input — only title is required. Asserts body defaults to empty
   * string in the POST payload (not undefined or null) and the returned
   * issue has state: "open".
   */
  it("sends body as empty string when not provided and returns open issue", async () => {
    mock.mockResolvedValueOnce(makeIssue({ body: "" }));

    await createIssue("owner", "repo", { title: "New issue" });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.body).toBe("");
    expect(payload).not.toHaveProperty("labels");
    expect(payload).not.toHaveProperty("assignees");
  });

  /**
   * Full input — title, body, labels, and assignees all supplied.
   * Asserts all four fields appear in the POST body.
   */
  it("includes labels and assignees in the POST body when provided", async () => {
    mock.mockResolvedValueOnce(makeIssue());

    await createIssue("owner", "repo", {
      title: "Bug",
      body: "Details",
      labels: ["bug"],
      assignees: ["alice"],
    });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.labels).toEqual(["bug"]);
    expect(payload.assignees).toEqual(["alice"]);
  });
});

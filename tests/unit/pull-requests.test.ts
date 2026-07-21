jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  listOpenPullRequests,
  getPullRequest,
  listPullRequestFiles,
  listPullRequestComments,
  updatePullRequest,
  createPullRequest,
} from "../../src/github/pull-requests";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

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
// listOpenPullRequests
// ---------------------------------------------------------------------------
describe("listOpenPullRequests", () => {
  /**
   * Return shape — verifies the summary fields returned for each PR.
   * listOpenPullRequests deliberately omits body, mergeable, stats, etc.
   * to keep the list payload lean.
   */
  it("returns summary fields for each open PR", async () => {
    mock.mockResolvedValueOnce([makePR()]);

    const result = await listOpenPullRequests("owner", "repo");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      number: 10,
      title: "Test PR",
      state: "open",
      author: "alice",
      head: "feat/foo",
      base: "main",
    });
    // Summary list must not include heavy fields
    expect(result[0]).not.toHaveProperty("body");
    expect(result[0]).not.toHaveProperty("mergeable");
  });

  /**
   * URL includes state=open — the endpoint is always called with state=open
   * baked in. Asserts the URL contains that param so the filter is never
   * accidentally dropped.
   */
  it("calls the GitHub API with state=open", async () => {
    mock.mockResolvedValueOnce([]);

    await listOpenPullRequests("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("state=open");
  });

  /**
   * Empty list — repo has no open PRs.
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array when there are no open PRs", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await listOpenPullRequests("owner", "repo");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPullRequest
// ---------------------------------------------------------------------------
describe("getPullRequest", () => {
  /**
   * Happy path — returns full detail including body, mergeable, and stats.
   * Unlike listOpenPullRequests, getPullRequest uses mapPullRequest which
   * includes all fields.
   */
  it("returns full PR detail including body and stats", async () => {
    mock.mockResolvedValueOnce(makePR());

    const result = await getPullRequest("owner", "repo", 10);

    expect(result.number).toBe(10);
    expect(result.body).toBe("PR body");
    expect(result.additions).toBe(10);
    expect(result.deletions).toBe(2);
    expect(result.changed_files).toBe(3);
    expect(result.headSha).toBe("deadbeef");
  });

  /**
   * draft defaults to false — GitHub may omit draft on older PRs.
   * Asserts the mapped result has draft: false (not undefined).
   */
  it("defaults draft to false when GitHub response omits the field", async () => {
    mock.mockResolvedValueOnce({ ...makePR(), draft: undefined });

    const result = await getPullRequest("owner", "repo", 10);

    expect(result.draft).toBe(false);
  });

  /**
   * mergeable null — GitHub returns null while the merge check is pending.
   * Asserts null is preserved rather than coerced to false or undefined.
   */
  it("preserves mergeable: null when GitHub returns null", async () => {
    mock.mockResolvedValueOnce({ ...makePR(), mergeable: null });

    const result = await getPullRequest("owner", "repo", 10);

    expect(result.mergeable).toBeNull();
  });

  /**
   * Null body — PR with no description.
   * Asserts null body is preserved in the mapped output.
   */
  it("preserves null body when PR has no description", async () => {
    mock.mockResolvedValueOnce(makePR({ body: null }));

    const result = await getPullRequest("owner", "repo", 10);

    expect(result.body).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPullRequestComments
// ---------------------------------------------------------------------------
describe("listPullRequestComments", () => {
  /**
   * Return shape — verifies each comment is mapped correctly.
   * These are conversation (timeline) comments, not inline review comments.
   */
  it("maps comment fields correctly", async () => {
    mock.mockResolvedValueOnce([
      {
        id: 55,
        body: "Looks good!",
        html_url: "https://github.com/owner/repo/pull/10#issuecomment-55",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        user: { login: "bob" },
      },
    ]);

    const result = await listPullRequestComments("owner", "repo", 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 55,
      body: "Looks good!",
      author: "bob",
    });
  });

  /**
   * Uses issues endpoint — conversation comments are fetched from
   * /issues/:number/comments, not /pulls/:number/comments (which is
   * for inline review comments). Asserts the correct URL is called.
   */
  it("fetches from the issues comments endpoint", async () => {
    mock.mockResolvedValueOnce([]);

    await listPullRequestComments("owner", "repo", 10);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/issues/10/comments");
  });

  /**
   * Empty list — PR has no comments.
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array when there are no comments", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await listPullRequestComments("owner", "repo", 10);

    expect(result).toEqual([]);
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
// createPullRequest
// ---------------------------------------------------------------------------
describe("createPullRequest", () => {
  /**
   * Happy path — all required fields supplied.
   * Asserts the POST body contains title, head, base, and that the
   * returned PR is correctly mapped.
   */
  it("sends required fields in the POST body and returns mapped PR", async () => {
    mock.mockResolvedValueOnce(makePR());

    const result = await createPullRequest("owner", "repo", {
      title: "My PR",
      head: "feat/foo",
      base: "main",
    });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.title).toBe("My PR");
    expect(payload.head).toBe("feat/foo");
    expect(payload.base).toBe("main");
    expect(payload.body).toBe(""); // defaults to empty string
    expect(result.number).toBe(10);
  });

  /**
   * draft flag forwarded — when draft: true is supplied the POST body
   * must include draft: true so GitHub creates a draft PR.
   */
  it("includes draft: true in the POST body when supplied", async () => {
    mock.mockResolvedValueOnce(makePR({ draft: true }));

    await createPullRequest("owner", "repo", {
      title: "Draft PR",
      head: "feat/foo",
      base: "main",
      draft: true,
    });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.draft).toBe(true);
  });

  /**
   * draft omitted — when draft is not supplied the POST body must not
   * include a draft key at all (not default to false), to avoid
   * inadvertently converting a non-draft PR to draft=false.
   */
  it("omits draft from the POST body when not supplied", async () => {
    mock.mockResolvedValueOnce(makePR());

    await createPullRequest("owner", "repo", {
      title: "PR",
      head: "feat/foo",
      base: "main",
    });

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload).not.toHaveProperty("draft");
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
    mock.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => makeFile(`file-${i}.ts`))
    );

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

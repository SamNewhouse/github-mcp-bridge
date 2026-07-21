jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  listOpenPullRequests,
  getPullRequest,
  listPullRequestFiles,
  updatePullRequest,
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

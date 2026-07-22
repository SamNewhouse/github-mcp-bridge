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
  getPullRequestDiff,
  listPullRequests,
  getPullRequestReviews,
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

/**
 * listOpenPullRequests
 *
 * Fetches open pull requests for a repository and maps each to a lean summary
 * shape — omitting body, mergeable, and diff stats to keep the list payload
 * small. Always called with state=open and per_page=100.
 */
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
   * per_page=100 — asserts the request fetches up to 100 PRs per page.
   */
  it("requests up to 100 PRs per page", async () => {
    mock.mockResolvedValueOnce([]);

    await listOpenPullRequests("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
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

/**
 * listPullRequests
 *
 * Fetches pull requests with a configurable state filter (open/closed/all).
 * Defaults to state=open. Returns a slightly richer shape than
 * listOpenPullRequests, including the draft field. Uses per_page=100.
 */
describe("listPullRequests", () => {
  /**
   * Default state — calling without a state argument defaults to "open".
   * Asserts the URL contains state=open.
   */
  it("defaults to state=open in the URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listPullRequests("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("state=open");
  });

  /**
   * state=all forwarded — asserts the encoded state param reaches the URL.
   */
  it("forwards state=all to the GitHub API URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listPullRequests("owner", "repo", "all");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("state=all");
  });

  /**
   * state=closed forwarded.
   */
  it("forwards state=closed to the GitHub API URL", async () => {
    mock.mockResolvedValueOnce([]);

    await listPullRequests("owner", "repo", "closed");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("state=closed");
  });

  /**
   * Return shape — listPullRequests includes draft unlike listOpenPullRequests.
   * Asserts draft is present in each mapped PR.
   */
  it("includes draft field in each mapped PR", async () => {
    mock.mockResolvedValueOnce([makePR({ draft: false }), makePR({ draft: true, number: 11 })]);

    const result = await listPullRequests("owner", "repo", "all");

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("draft", false);
    expect(result[1]).toHaveProperty("draft", true);
  });

  /**
   * draft defaults to false — GitHub may omit draft on older PRs.
   * Asserts the mapped result has draft: false (not undefined).
   */
  it("defaults draft to false when GitHub response omits the field", async () => {
    mock.mockResolvedValueOnce([{ ...makePR(), draft: undefined }]);

    const result = await listPullRequests("owner", "repo");

    expect(result[0]!.draft).toBe(false);
  });

  /**
   * Empty list — no PRs match the filter.
   */
  it("returns an empty array when there are no matching PRs", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await listPullRequests("owner", "repo", "closed");

    expect(result).toEqual([]);
  });

  /**
   * per_page=100 — asserts the request fetches up to 100 PRs per page.
   */
  it("requests up to 100 PRs per page", async () => {
    mock.mockResolvedValueOnce([]);

    await listPullRequests("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
  });
});

/**
 * getPullRequest
 *
 * Fetches full detail for a single PR by number, including body, mergeable
 * status, diff stats, and headSha. draft defaults to false when absent.
 * mergeable is preserved as null when GitHub's merge check is still pending.
 */
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

/**
 * getPullRequestDiff
 *
 * Fetches the raw unified diff for a pull request. Requires the
 * application/vnd.github.diff Accept header and responseType: "text" so
 * githubRequest returns the raw diff string rather than attempting JSON
 * parsing. Returns { pullNumber, diff }.
 */
describe("getPullRequestDiff", () => {
  /**
   * Happy path — returns pullNumber and the raw unified diff string.
   * Asserts the shape matches { pullNumber, diff } and the diff content
   * is the string returned by the GitHub diff endpoint.
   */
  it("returns pullNumber and diff string", async () => {
    const rawDiff = "diff --git a/src/foo.ts b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new";
    mock.mockResolvedValueOnce(rawDiff);

    const result = await getPullRequestDiff("owner", "repo", 10);

    expect(result.pullNumber).toBe(10);
    expect(result.diff).toBe(rawDiff);
  });

  /**
   * Accept header — the diff endpoint requires a specific Accept header
   * (application/vnd.github.diff) to return a raw diff instead of JSON.
   * Asserts the header is passed through to githubRequest.
   */
  it("sends the application/vnd.github.diff Accept header", async () => {
    mock.mockResolvedValueOnce("");

    await getPullRequestDiff("owner", "repo", 10);

    const [, options] = (mock as jest.Mock).mock.calls[0];
    const headers = new Headers(options.headers);
    expect(headers.get("Accept")).toBe("application/vnd.github.diff");
  });

  /**
   * responseType text — asserts the request is made with responseType: "text"
   * so githubRequest returns the raw string body rather than trying to
   * parse it as JSON.
   */
  it("requests responseType: text so the raw diff string is returned", async () => {
    mock.mockResolvedValueOnce("");

    await getPullRequestDiff("owner", "repo", 10);

    const [, options] = (mock as jest.Mock).mock.calls[0];
    expect(options.responseType).toBe("text");
  });

  /**
   * Empty diff — PR with no changes (edge case, e.g. a no-op merge).
   * Asserts an empty string diff is returned without error.
   */
  it("returns an empty diff string when the PR has no changes", async () => {
    mock.mockResolvedValueOnce("");

    const result = await getPullRequestDiff("owner", "repo", 10);

    expect(result.diff).toBe("");
    expect(result.pullNumber).toBe(10);
  });
});

/**
 * listPullRequestComments
 *
 * Fetches conversation (timeline) comments on a pull request using the
 * /issues/:number/comments endpoint — not the inline review comments
 * endpoint. Maps each comment to a flat shape with author from user.login.
 * Uses per_page=100.
 */
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
   * per_page=100 — asserts up to 100 comments are fetched in one call.
   */
  it("requests up to 100 comments per page", async () => {
    mock.mockResolvedValueOnce([]);

    await listPullRequestComments("owner", "repo", 10);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
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

/**
 * getPullRequestReviews
 *
 * Fetches all reviews on a pull request from /pulls/:pullNumber/reviews.
 * Maps each review to a flat shape with author from user.login.
 * submitted_at is preserved as null for pending or dismissed reviews.
 * Uses per_page=100.
 */
describe("getPullRequestReviews", () => {
  function makeReview(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 100,
      state: "APPROVED",
      body: "LGTM",
      html_url: "https://github.com/owner/repo/pull/10#pullrequestreview-100",
      submitted_at: "2026-01-01T00:00:00Z",
      user: { login: "reviewer" },
      commit_id: "deadbeef",
      ...overrides,
    };
  }

  /**
   * Return shape — verifies each review is mapped to the expected fields.
   * Asserts id, state, body, author, commit_id, submitted_at, html_url.
   */
  it("maps review fields correctly", async () => {
    mock.mockResolvedValueOnce([makeReview()]);

    const result = await getPullRequestReviews("owner", "repo", 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 100,
      state: "APPROVED",
      body: "LGTM",
      author: "reviewer",
      commit_id: "deadbeef",
      submitted_at: "2026-01-01T00:00:00Z",
    });
    expect(result[0]).toHaveProperty("html_url");
  });

  /**
   * Multiple reviews — PR with CHANGES_REQUESTED then APPROVED.
   * Asserts all reviews are returned in order.
   */
  it("returns all reviews in the order GitHub returns them", async () => {
    mock.mockResolvedValueOnce([
      makeReview({ id: 1, state: "CHANGES_REQUESTED" }),
      makeReview({ id: 2, state: "APPROVED" }),
    ]);

    const result = await getPullRequestReviews("owner", "repo", 10);

    expect(result).toHaveLength(2);
    expect(result[0]!.state).toBe("CHANGES_REQUESTED");
    expect(result[1]!.state).toBe("APPROVED");
  });

  /**
   * submitted_at null — GitHub returns null for pending/dismissed reviews.
   * Asserts null is preserved in the mapped output.
   */
  it("preserves submitted_at: null for pending reviews", async () => {
    mock.mockResolvedValueOnce([makeReview({ submitted_at: null })]);

    const result = await getPullRequestReviews("owner", "repo", 10);

    expect(result[0]!.submitted_at).toBeNull();
  });

  /**
   * Empty body — review with no description text.
   * Asserts empty string body is preserved (not coerced to null).
   */
  it("preserves empty string body for reviews with no comment", async () => {
    mock.mockResolvedValueOnce([makeReview({ body: "" })]);

    const result = await getPullRequestReviews("owner", "repo", 10);

    expect(result[0]!.body).toBe("");
  });

  /**
   * Uses the correct reviews endpoint — asserts the URL calls
   * /pulls/:pullNumber/reviews, not /issues/:pullNumber/comments.
   */
  it("fetches from the pulls reviews endpoint", async () => {
    mock.mockResolvedValueOnce([]);

    await getPullRequestReviews("owner", "repo", 10);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/pulls/10/reviews");
  });

  /**
   * per_page=100 — asserts the request fetches up to 100 reviews per page.
   */
  it("requests up to 100 reviews per page", async () => {
    mock.mockResolvedValueOnce([]);

    await getPullRequestReviews("owner", "repo", 10);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
  });

  /**
   * Empty list — PR has no reviews.
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array when there are no reviews", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await getPullRequestReviews("owner", "repo", 10);

    expect(result).toEqual([]);
  });
});

/**
 * updatePullRequest
 *
 * Sends a PATCH request to update one or more fields of an existing PR.
 * Requires at least one field to be supplied; throws AppError otherwise.
 * Only provided fields are included in the PATCH body to avoid accidentally
 * clearing fields the caller didn't intend to change.
 */
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

/**
 * createPullRequest
 *
 * Creates a new PR via POST. title, head, and base are required; body
 * defaults to empty string. draft is forwarded only when explicitly
 * supplied — it is omitted from the body entirely when not provided.
 * Returns the fully mapped PR including number and html_url.
 */
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
    expect(payload.body).toBe("");
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

/**
 * listPullRequestFiles
 *
 * Lists files changed in a pull request using per_page=100. The GitHub
 * API caps this endpoint at 100 files — when exactly 100 are returned
 * the result is marked truncated: true to signal potential incompleteness.
 * Binary files have no patch; these are normalised to null.
 */
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

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

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

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
   * per_page=100 — asserts the request fetches up to 100 issues per page
   * so a single call returns all issues without additional pagination.
   */
  it("requests up to 100 issues per page", async () => {
    mock.mockResolvedValueOnce([]);

    await listIssues("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
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
    expect(result.keyword).toBe("closes");
    const patchBody = JSON.parse((mock as jest.Mock).mock.calls[1][1].body);
    expect(patchBody.body).toContain("closes #5");
  });

  /**
   * Already linked (exact case) — PR body already contains "closes #5".
   * Asserts no PATCH is made and linked: false with a reason is returned,
   * making the operation idempotent.
   */
  it("returns linked: false and skips PATCH when issue is already referenced", async () => {
    mock.mockResolvedValueOnce({ number: 10, body: "closes #5" });

    const result = await linkIssueToPullRequest("owner", "repo", 10, 5);

    expect(result.linked).toBe(false);
    expect(result).toHaveProperty("reason");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  /**
   * Already linked (mixed case) — PR body contains "Closes #5" with a capital C.
   * Asserts the regex match is case-insensitive so duplicates aren't appended.
   */
  it("returns linked: false when issue is already referenced with different casing", async () => {
    mock.mockResolvedValueOnce({ number: 10, body: "Closes #5" });

    const result = await linkIssueToPullRequest("owner", "repo", 10, 5);

    expect(result.linked).toBe(false);
  });

  /**
   * Keyword variants — uses keyword: "fixes".
   * Asserts the PATCH body contains "fixes #5" (not "closes").
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
   * Asserts the PATCH body contains "resolves #5".
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
    expect(result[0]).toMatchObject({ id: 42, body: "LGTM", author: "alice" });
  });

  /**
   * per_page=100 — asserts the request fetches up to 100 comments per page.
   */
  it("requests up to 100 comments per page", async () => {
    mock.mockResolvedValueOnce([]);

    await listIssueComments("owner", "repo", 1);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
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

describe("createIssue", () => {
  /**
   * Minimal input — only title is required. Asserts body defaults to empty
   * string in the POST payload (not undefined or null).
   */
  it("sends body as empty string when not provided", async () => {
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

  /**
   * Return shape includes html_url — asserts createIssue maps html_url
   * from the GitHub response so callers can link directly to the new issue.
   */
  it("returns html_url in the mapped response", async () => {
    mock.mockResolvedValueOnce(makeIssue());

    const result = await createIssue("owner", "repo", { title: "Bug" });

    expect(result).toHaveProperty("html_url", "https://github.com/owner/repo/issues/1");
  });
});

jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  getRepository,
  listRepositories,
} from "../../src/github/repositories";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: "my-repo",
    full_name: "alice/my-repo",
    private: false,
    default_branch: "main",
    html_url: "https://github.com/alice/my-repo",
    updated_at: "2026-01-01T00:00:00Z",
    owner: { login: "alice" },
    ...overrides,
  };
}

function makeFullRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: "my-repo",
    full_name: "alice/my-repo",
    private: false,
    default_branch: "main",
    html_url: "https://github.com/alice/my-repo",
    description: "Test repository",
    language: "TypeScript",
    stargazers_count: 42,
    forks_count: 7,
    open_issues_count: 3,
    pushed_at: "2026-01-02T00:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    owner: { login: "alice" },
    topics: ["mcp", "github"],
    visibility: "public",
    ...overrides,
  };
}

/**
 * listRepositories
 *
 * Fetches all repositories accessible to the configured PAT and maps each
 * GitHub repo object to a flat shape. owner is flattened from owner.login.
 * The request is sorted by most recently updated and uses per_page=100 to
 * return as many repos as possible in a single call.
 */
describe("listRepositories", () => {
  /**
   * Return shape — verifies all mapped fields are present and correctly
   * extracted, including owner which is flattened from owner.login.
   */
  it("maps all fields including flattened owner login", async () => {
    mock.mockResolvedValueOnce([makeRepo()]);

    const result = await listRepositories();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      name: "my-repo",
      full_name: "alice/my-repo",
      owner: "alice",
      private: false,
      default_branch: "main",
      html_url: "https://github.com/alice/my-repo",
      updated_at: "2026-01-01T00:00:00Z",
    });
  });

  /**
   * URL uses sort=updated and per_page=100 — asserts the request is
   * sorted by most recently updated and fetches up to 100 repos in one call.
   */
  it("requests repos sorted by updated with per_page=100", async () => {
    mock.mockResolvedValueOnce([]);

    await listRepositories();

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("sort=updated");
    expect(url).toContain("per_page=100");
  });

  /**
   * Private repo — asserts private: true is preserved in the mapped output.
   */
  it("preserves private: true for private repositories", async () => {
    mock.mockResolvedValueOnce([makeRepo({ private: true })]);

    const [repo] = await listRepositories();

    expect(repo!.private).toBe(true);
  });

  /**
   * Multiple repos — asserts all items in the response array are mapped,
   * not just the first.
   */
  it("maps all repositories in the response", async () => {
    mock.mockResolvedValueOnce([
      makeRepo({ id: 1, name: "repo-a" }),
      makeRepo({ id: 2, name: "repo-b" }),
      makeRepo({ id: 3, name: "repo-c" }),
    ]);

    const result = await listRepositories();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toEqual(["repo-a", "repo-b", "repo-c"]);
  });

  /**
   * Empty list — user has no accessible repositories.
   * Asserts an empty array is returned without error.
   */
  it("returns an empty array when there are no repositories", async () => {
    mock.mockResolvedValueOnce([]);

    const result = await listRepositories();

    expect(result).toEqual([]);
  });
});

/**
 * getRepository
 *
 * Fetches full detail for a single repository and maps the GitHub response
 * to a flat shape. owner is flattened from owner.login. topics defaults
 * to an empty array when omitted by the API, and nullable fields such as
 * description and language are preserved as null.
 */
describe("getRepository", () => {
  /**
   * Return shape — verifies detailed repository fields are present and
   * correctly mapped, including topics and visibility.
   */
  it("maps repository detail fields including topics and visibility", async () => {
    mock.mockResolvedValueOnce(makeFullRepo());

    const result = await getRepository("alice", "my-repo");

    expect(result).toMatchObject({
      id: 1,
      owner: "alice",
      name: "my-repo",
      full_name: "alice/my-repo",
      private: false,
      default_branch: "main",
      html_url: "https://github.com/alice/my-repo",
      description: "Test repository",
      language: "TypeScript",
      stargazers_count: 42,
      forks_count: 7,
      open_issues_count: 3,
      topics: ["mcp", "github"],
      visibility: "public",
      pushed_at: "2026-01-02T00:00:00Z",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
  });

  /**
   * Null preservation — GitHub may return null for description or language.
   * Asserts both fields are preserved as null in the mapped output.
   */
  it("preserves null description and language", async () => {
    mock.mockResolvedValueOnce(
      makeFullRepo({ description: null, language: null }),
    );

    const result = await getRepository("alice", "my-repo");

    expect(result.description).toBeNull();
    expect(result.language).toBeNull();
  });

  /**
   * topics default — GitHub may omit topics in some responses.
   * Asserts the mapped output normalises missing topics to [].
   */
  it("defaults missing topics to an empty array", async () => {
    const repo = makeFullRepo();
    delete (repo as any).topics;
    mock.mockResolvedValueOnce(repo);

    const result = await getRepository("alice", "my-repo");

    expect(result.topics).toEqual([]);
  });
});

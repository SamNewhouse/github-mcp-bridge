import { callTool, callToolRaw, OWNER, REPO } from "./helpers";

describe("search_code (integration)", () => {
  it("returns results with path and matches for a known query", async () => {
    const result = await callTool("search_code", {
      owner: OWNER,
      repo: REPO,
      query: "githubRequest",
    });
    expect(result.results.total_count).toBeGreaterThan(0);
    expect(Array.isArray(result.results.items)).toBe(true);
    const item = result.results.items[0];
    expect(item).toHaveProperty("path");
    expect(item).toHaveProperty("matches");
  });

  it("returns total_count: 0 and empty items for a query with no matches", async () => {
    const noMatchQuery = ["xQ9", "zW2", "mK7"].join("__nomatch__");
    const result = await callTool("search_code", {
      owner: OWNER,
      repo: REPO,
      query: noMatchQuery,
    });
    expect(result.results.total_count).toBe(0);
    expect(result.results.items).toHaveLength(0);
  });
});

describe("search_files (integration)", () => {
  it("returns matching files for a known path pattern", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: ".integration",
      ref: "main",
    });
    expect(result.results.total_matched).toBeGreaterThan(0);
    expect(Array.isArray(result.results.files)).toBe(true);
    for (const file of result.results.files) {
      expect(file.path.toLowerCase()).toContain(".integration");
    }
  });

  it("returns empty result for a pattern that matches nothing", async () => {
    const noMatchPattern = ["xQ9", "zW2", "mK7"].join("__nomatch__");
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: noMatchPattern,
    });
    expect(result.results.total_matched).toBe(0);
    expect(result.results.files).toHaveLength(0);
  });

  it("returns results when a ref is provided", async () => {
    const result = await callTool("search_files", {
      owner: OWNER,
      repo: REPO,
      pattern: "github",
      ref: "main",
    });
    expect(result.results.total_matched).toBeGreaterThan(0);
  });

  it("rejects request with missing pattern field", async () => {
    const json = await callToolRaw("search_files", {
      owner: OWNER,
      repo: REPO,
    });
    expect(json.error).toBeDefined();
  });
});

describe("unknown tool (integration)", () => {
  it("returns an error for an unknown tool name", async () => {
    const json = await callToolRaw("tool_that_does_not_exist", {});
    expect(json.error).toBeDefined();
  });
});

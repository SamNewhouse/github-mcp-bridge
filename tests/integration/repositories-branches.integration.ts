import { callTool, callToolRaw, OWNER, REPO } from "./helpers";

describe("list_repositories (integration)", () => {
  it("returns a non-empty array of repositories with expected fields", async () => {
    const result = await callTool("list_repositories", {});
    expect(Array.isArray(result.repositories)).toBe(true);
    expect(result.repositories.length).toBeGreaterThan(0);
    const repo = result.repositories[0];
    expect(repo).toHaveProperty("full_name");
    expect(repo).toHaveProperty("private");
    expect(repo).toHaveProperty("default_branch");
  });

  it("rejects unauthenticated requests with error code -32001", async () => {
    const res = await fetch(`http://localhost:${process.env.PORT ?? "3000"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_repositories", arguments: {} },
      }),
    });
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32001);
  });
});

describe("list_branches (integration)", () => {
  it("returns branches with name, sha, and protected fields", async () => {
    const result = await callTool("list_branches", {
      owner: OWNER,
      repo: REPO,
    });
    expect(Array.isArray(result.branches)).toBe(true);
    expect(result.branches.length).toBeGreaterThan(0);
    const branch = result.branches[0];
    expect(branch).toHaveProperty("name");
    expect(branch).toHaveProperty("sha");
    expect(typeof branch.protected).toBe("boolean");
  });

  it("rejects request with missing repo field", async () => {
    const json = await callToolRaw("list_branches", { owner: OWNER });
    expect(json.error).toBeDefined();
  });
});

describe("get_branch (integration)", () => {
  it("returns branch detail including latest_commit for main", async () => {
    const result = await callTool("get_branch", {
      owner: OWNER,
      repo: REPO,
      branch: "main",
    });
    expect(result.branch.name).toBe("main");
    expect(result.branch).toHaveProperty("sha");
    expect(result.branch.latest_commit).toHaveProperty("message");
    expect(result.branch.latest_commit).toHaveProperty("author");
    expect(result.branch.latest_commit).toHaveProperty("date");
  });

  it("throws for a non-existent branch", async () => {
    await expect(
      callTool("get_branch", {
        owner: OWNER,
        repo: REPO,
        branch: "branch-that-does-not-exist-xyz",
      }),
    ).rejects.toThrow();
  });
});

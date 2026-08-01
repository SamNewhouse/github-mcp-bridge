import { callTool, callToolRaw, OWNER, REPO } from "./helpers";

describe("get_commit (integration)", () => {
  it("returns commit detail with stats and files for a real commit SHA", async () => {
    const branch = await callTool("get_branch", {
      owner: OWNER,
      repo: REPO,
      branch: "main",
    });
    const sha = branch.branch.sha;
    const result = await callTool("get_commit", {
      owner: OWNER,
      repo: REPO,
      ref: sha,
    });
    expect(result.commit.sha).toBe(sha);
    expect(typeof result.commit.message).toBe("string");
    expect(result.commit.stats).not.toBeUndefined();
    expect(Array.isArray(result.commit.files)).toBe(true);
  });

  it("throws for an invalid commit SHA", async () => {
    await expect(
      callTool("get_commit", {
        owner: OWNER,
        repo: REPO,
        ref: "0000000000000000000000000000000000000000",
      }),
    ).rejects.toThrow();
  });
});

describe("list_commits (integration)", () => {
  it("returns recent commits with expected fields", async () => {
    const result = await callTool("list_commits", {
      owner: OWNER,
      repo: REPO,
      branch: "main",
      perPage: 5,
    });
    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
    const commit = result.commits[0];
    expect(commit).toHaveProperty("sha");
    expect(commit).toHaveProperty("message");
    expect(commit).toHaveProperty("author");
    expect(commit).toHaveProperty("date");
  });

  it("filters commits to those touching a specific path", async () => {
    const result = await callTool("list_commits", {
      owner: OWNER,
      repo: REPO,
      path: "package.json",
      perPage: 10,
    });
    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
  });

  it("respects the perPage limit", async () => {
    const result = await callTool("list_commits", {
      owner: OWNER,
      repo: REPO,
      perPage: 3,
    });
    expect(result.commits.length).toBeLessThanOrEqual(3);
  });
});

describe("list_directory (integration)", () => {
  it("returns entries with file and dir types at the repo root", async () => {
    const result = await callTool("list_directory", {
      owner: OWNER,
      repo: REPO,
      path: "",
    });
    expect(Array.isArray(result.entries)).toBe(true);
    const types = result.entries.map((e: any) => e.type);
    expect(types).toContain("file");
    expect(types).toContain("dir");
  });

  it("returns file entries for a known directory path", async () => {
    const result = await callTool("list_directory", {
      owner: OWNER,
      repo: REPO,
      path: "src/github",
    });
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.type).toBe("file");
    }
  });

  it("throws for a non-existent path", async () => {
    await expect(
      callTool("list_directory", {
        owner: OWNER,
        repo: REPO,
        path: "does/not/exist",
      }),
    ).rejects.toThrow();
  });
});

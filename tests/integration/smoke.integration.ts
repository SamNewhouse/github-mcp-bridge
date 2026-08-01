import { describe, expect, test } from "@jest/globals";
import { callTool, OWNER, REPO } from "./helpers";


describe("smoke", () => {
  test("tools/list succeeds", async () => {
    const res = await fetch(`http://localhost:${process.env.PORT ?? "3000"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CONNECTOR_SECRET!}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    const json = await res.json();
    expect(json.error).toBeUndefined();
    expect(Array.isArray(json.result.tools)).toBe(true);
    expect(json.result.tools.length).toBeGreaterThan(0);
  });

  test("list_repositories succeeds", async () => {
    const result = await callTool("list_repositories", {});
    expect(Array.isArray(result.repositories)).toBe(true);
    expect(result.repositories.length).toBeGreaterThan(0);
  });

  test("list_branches succeeds for configured repo", async () => {
    const result = await callTool("list_branches", {
      owner: OWNER,
      repo: REPO,
    });

    expect(Array.isArray(result.branches)).toBe(true);
    expect(result.branches.length).toBeGreaterThan(0);
  });
});

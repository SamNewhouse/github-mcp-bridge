import { beforeEach, describe, expect, test } from "@jest/globals";
import { callTool, initializeSession, OWNER, postSessionJsonRpc, REPO, resetSession } from "./helpers";

describe("smoke", () => {
  beforeEach(() => {
    resetSession();
  });

  test("tools/list succeeds after initialize", async () => {
    await initializeSession();

    const res = await postSessionJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const json = await res.json();

    expect(json.error).toBeUndefined();
    expect(Array.isArray(json.result.tools)).toBe(true);
    expect(json.result.tools.length).toBeGreaterThan(0);

    // We no longer enforce a real MCP session; just ensure a header is present.
    const returnedSession = res.headers.get("mcp-session-id");
    expect(typeof returnedSession).toBe("string");
    expect(returnedSession?.length).toBeGreaterThan(0);
  });

  test("initialize succeeds and provides a session header", async () => {
    const sessionId = await initializeSession();

    // Session is now a formality; we only care that it’s a non‑empty string.
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
  });

  test("list_repositories succeeds after initialize", async () => {
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

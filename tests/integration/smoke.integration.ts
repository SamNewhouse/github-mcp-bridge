import { beforeEach, describe, expect, test } from "@jest/globals";
import {
  callTool,
  initializeSession,
  OWNER,
  postAutoSessionJsonRpc,
  postSessionJsonRpc,
  REPO,
  resetSession,
} from "./helpers";

describe("smoke", () => {
  beforeEach(() => {
    resetSession();
  });

  test("tools/list succeeds without explicit initialize", async () => {
    const res = await postAutoSessionJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const json = await res.json();
    expect(json.error).toBeUndefined();
    expect(Array.isArray(json.result.tools)).toBe(true);
    expect(json.result.tools.length).toBeGreaterThan(0);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
  });

  test("initialize still succeeds for compatibility", async () => {
    const sessionId = await initializeSession();
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);

    const res = await postSessionJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    const json = await res.json();
    expect(json.error).toBeUndefined();
    expect(Array.isArray(json.result.tools)).toBe(true);
  });

  test("list_repositories succeeds without explicit initialize", async () => {
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

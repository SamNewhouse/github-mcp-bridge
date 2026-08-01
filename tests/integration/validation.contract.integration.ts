import { describe, expect, test } from "@jest/globals";
import { callToolRaw, OWNER, REPO } from "./helpers";

describe("validation contract", () => {
  test("rejects list_branches without repo", async () => {
    const json = await callToolRaw("list_branches", { owner: OWNER });

    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32602);
    expect(JSON.stringify(json.error)).toMatch(/repo/i);
  });

  test("rejects invalid list_issues state", async () => {
    const json = await callToolRaw("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "bad",
    });

    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32602);
    expect(JSON.stringify(json.error)).toMatch(/state/i);
  });

  test("rejects oversized pageSize for get_multiple_files", async () => {
    const json = await callToolRaw("get_multiple_files", {
      owner: OWNER,
      repo: REPO,
      paths: ["README.md"],
      pageSize: 999,
    });

    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32602);
    expect(JSON.stringify(json.error)).toMatch(/pageSize/i);
  });
});

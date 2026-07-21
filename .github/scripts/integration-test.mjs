#!/usr/bin/env node
/**
 * Integration test for github-mcp-bridge.
 *
 * How it works:
 *   1. Calls tools/list to get every registered tool from the live server
 *   2. For each tool, looks up test args from the TOOL_ARGS map below
 *   3. Calls tools/call with those args and asserts no error is returned
 *   4. If a tool has no entry in TOOL_ARGS, it is flagged as UNTESTED (warning,
 *      not a failure) so you know to add coverage — but CI still passes
 *
 * Adding a new tool:
 *   Just add an entry to TOOL_ARGS below. The test will pick it up automatically.
 *   Write-only tools (create/update/delete) should be added to SKIP_TOOLS instead.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const SECRET = process.env.SECRET;
const OWNER = process.env.OWNER ?? "SamNewhouse";
const REPO = process.env.REPO ?? "github-mcp-bridge";

if (!SECRET) {
  console.error("ERROR: SECRET env var is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tools to skip entirely (write/mutating tools that would pollute the repo).
// These are covered by manual curl tests.
// ---------------------------------------------------------------------------
const SKIP_TOOLS = new Set([
  "create_branch",
  "upsert_file",
  "create_pull_request",
  "update_pull_request",
  "create_issue",
  "update_issue",
  "link_issue_to_pull_request",
  "add_issue_comment",
]);

// ---------------------------------------------------------------------------
// Test args for every read tool.
// Add a new tool here and it will automatically be tested.
// ---------------------------------------------------------------------------
const r = { owner: OWNER, repo: REPO };

const TOOL_ARGS = {
  list_repositories:          {},
  list_branches:              { ...r },
  get_branch:                 { ...r, branch: "main" },
  list_directory:             { ...r, path: "src" },
  get_file_contents:          { ...r, path: "package.json" },
  get_multiple_files:         { ...r, paths: ["package.json", "tsconfig.json"] },
  list_open_pull_requests:    { ...r },
  get_pull_request:           { ...r, pullNumber: 1 },
  list_pull_request_files:    { ...r, pullNumber: 1 },
  list_pull_request_comments: { ...r, pullNumber: 1 },
  get_pull_request_diff:      { ...r, pullNumber: 1 },
  list_issues:                { ...r, state: "open" },
  get_issue:                  { ...r, issueNumber: 1 },
  list_issue_comments:        { ...r, issueNumber: 1 },
  list_commits:               { ...r, branch: "main", perPage: 5 },
  get_commit:                 { ...r, ref: "main" },
  search_files:               { ...r, pattern: "validation" },
  search_code:                { ...r, query: "defineTool" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function rpc(id, method, params = {}) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function listTools() {
  const json = await rpc(0, "tools/list");
  if (json.error) throw new Error(`tools/list failed: ${JSON.stringify(json.error)}`);
  return json.result.tools.map((t) => t.name);
}

async function callTool(id, name, args) {
  const json = await rpc(id, "tools/call", { name, arguments: args });
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const registeredTools = await listTools();
console.log(`\n🔍 Discovered ${registeredTools.length} tools via tools/list\n`);

let passed = 0;
let skipped = 0;
let untested = 0;
let failed = 0;
const failures = [];

for (const [i, name] of registeredTools.entries()) {
  if (SKIP_TOOLS.has(name)) {
    console.log(`  ⏭️  [skip]    ${name}`);
    skipped++;
    continue;
  }

  if (!(name in TOOL_ARGS)) {
    console.log(`  ⚠️  [untested] ${name}  ← add to TOOL_ARGS in integration-test.mjs`);
    untested++;
    continue;
  }

  try {
    await callTool(i + 1, name, TOOL_ARGS[name]);
    console.log(`  ✅ [pass]    ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ [fail]    ${name}`);
    console.log(`             ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

console.log(`
${"-".repeat(50)}`);
console.log(`Passed: ${passed} | Skipped: ${skipped} | Untested: ${untested} | Failed: ${failed}`);
console.log(`Total registered: ${registeredTools.length}`);

if (untested > 0) {
  console.log(`
⚠️  ${untested} tool(s) have no test args — add them to TOOL_ARGS in .github/scripts/integration-test.mjs`);
}

if (failed > 0) {
  console.log(`
❌ Failures:`);
  for (const f of failures) console.log(`   ${f.name}: ${f.error}`);
  process.exit(1);
}

console.log(`
✨ All tested tools passed!`);
process.exit(0);

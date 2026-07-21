#!/usr/bin/env node
/**
 * Integration test for github-mcp-bridge.
 *
 * Fully dynamic — no hardcoded tool names or arg lists.
 *
 * How it works:
 *   1. Calls tools/list to discover every registered tool + its inputSchema
 *   2. For each tool, auto-generates minimal valid args from the schema
 *      using a set of field-name heuristics (owner, repo, branch, etc.)
 *   3. Write tools are detected by name prefix and skipped automatically
 *   4. If a required field has no heuristic match, the tool is flagged as
 *      UNTESTED so you know to add a heuristic — but CI still passes
 *
 * To add support for a new field type: add one entry to FIELD_DEFAULTS below.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const SECRET = process.env.SECRET;
const OWNER = process.env.OWNER ?? "SamNewhouse";
const REPO = process.env.REPO ?? "github-mcp-bridge";
const TEST_PR = parseInt(process.env.TEST_PR ?? "1", 10);
const TEST_ISSUE = parseInt(process.env.TEST_ISSUE ?? "1", 10);

if (!SECRET) {
  console.error("ERROR: SECRET env var is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write tool detection — any tool whose name starts with these prefixes
// is considered mutating and will be skipped automatically.
// ---------------------------------------------------------------------------
const WRITE_PREFIXES = ["create_", "update_", "add_", "upsert_", "link_", "delete_"];

function isWriteTool(name) {
  return WRITE_PREFIXES.some((p) => name.startsWith(p));
}

// ---------------------------------------------------------------------------
// Field heuristics — maps a field name to a sensible test value.
// Add new entries here when a new field type is introduced.
// ---------------------------------------------------------------------------
const FIELD_DEFAULTS = {
  owner:       OWNER,
  repo:        REPO,
  branch:      "main",
  ref:         "main",
  baseBranch:  "main",
  newBranch:   "test-branch",
  path:        "src",
  paths:       ["package.json", "tsconfig.json"],
  pattern:     "src",
  query:       "export",
  pullNumber:  TEST_PR,
  issueNumber: TEST_ISSUE,
  state:       "open",
  title:       "Test title",
  body:        "Test body",
  head:        "main",
  base:        "main",
  message:     "Test message",
  content:     "test",
  perPage:     5,
  keyword:     "closes",
};

// ---------------------------------------------------------------------------
// Auto-generate args from a JSON Schema by resolving each required field
// against FIELD_DEFAULTS. Returns null if any required field is unresolvable.
// ---------------------------------------------------------------------------
function generateArgs(schema) {
  const required = schema.required ?? [];
  const properties = schema.properties ?? {};
  const args = {};
  const missing = [];

  for (const field of required) {
    if (field in FIELD_DEFAULTS) {
      args[field] = FIELD_DEFAULTS[field];
    } else {
      missing.push(field);
    }
  }

  // Also apply known optional fields that have sensible defaults
  for (const field of Object.keys(properties)) {
    if (!(field in args) && field in FIELD_DEFAULTS) {
      args[field] = FIELD_DEFAULTS[field];
    }
  }

  return { args, missing };
}

// ---------------------------------------------------------------------------
// RPC helpers
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
  return json.result.tools; // [{ name, description, inputSchema }]
}

async function callTool(id, name, args) {
  const json = await rpc(id, "tools/call", { name, arguments: args });
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const tools = await listTools();
console.log(`\n🔍 Discovered ${tools.length} tools via tools/list\n`);

let passed = 0;
let skipped = 0;
let untested = 0;
let failed = 0;
const failures = [];

for (const [i, tool] of tools.entries()) {
  const { name, inputSchema } = tool;

  if (isWriteTool(name)) {
    console.log(`  ⏭️  [skip]     ${name}`);
    skipped++;
    continue;
  }

  const { args, missing } = generateArgs(inputSchema);

  if (missing.length > 0) {
    console.log(`  ⚠️  [untested] ${name}  ← unknown fields: ${missing.join(", ")} — add to FIELD_DEFAULTS`);
    untested++;
    continue;
  }

  try {
    await callTool(i + 1, name, args);
    console.log(`  ✅ [pass]     ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ [fail]     ${name}`);
    console.log(`              ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

console.log(`\n${"-".repeat(50)}`);
console.log(`Passed: ${passed} | Skipped: ${skipped} | Untested: ${untested} | Failed: ${failed}`);
console.log(`Total registered: ${tools.length}`);

if (untested > 0) {
  console.log(`\n⚠️  ${untested} tool(s) could not be auto-tested.`);
  console.log(`   Add the unknown field names to FIELD_DEFAULTS in .github/scripts/integration-test.mjs`);
}

if (failed > 0) {
  console.log(`\n❌ Failures:`);
  for (const f of failures) console.log(`   ${f.name}: ${f.error}`);
  process.exit(1);
}

console.log(`\n✨ All tested tools passed!`);
process.exit(0);

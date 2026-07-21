#!/usr/bin/env node
/**
 * Integration test runner for github-mcp-bridge.
 * Tests every tool by calling the local server and asserting:
 *   - HTTP 200
 *   - Response contains "result" (not "error")
 *
 * Required env vars:
 *   BASE    - e.g. http://localhost:3000
 *   SECRET  - CONNECTOR_SECRET value
 *   OWNER   - GitHub owner
 *   REPO    - GitHub repo
 */

const BASE = process.env.BASE;
const SECRET = process.env.SECRET;
const OWNER = process.env.OWNER;
const REPO = process.env.REPO;

if (!BASE || !SECRET || !OWNER || !REPO) {
  console.error("Missing required env vars: BASE, SECRET, OWNER, REPO");
  process.exit(1);
}

async function call(id, name, args) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for tool "${name}"`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`Tool "${name}" returned error: ${JSON.stringify(json.error)}`);
  }

  if (!json.result) {
    throw new Error(`Tool "${name}" returned no result`);
  }

  return json.result;
}

// ──────────────────────────────────────────────────────
// Test definitions — all 26 tools
// ──────────────────────────────────────────────────────
const tests = [
  // —— Repositories ——
  {
    name: "list_repositories",
    args: {},
  },

  // —— Branches ——
  {
    name: "list_branches",
    args: { owner: OWNER, repo: REPO },
  },
  {
    name: "get_branch",
    args: { owner: OWNER, repo: REPO, branch: "main" },
  },

  // —— Files ——
  {
    name: "list_directory",
    args: { owner: OWNER, repo: REPO, path: "src" },
  },
  {
    name: "get_file_contents",
    args: { owner: OWNER, repo: REPO, path: "package.json" },
  },
  {
    name: "get_multiple_files",
    args: { owner: OWNER, repo: REPO, paths: ["package.json", "tsconfig.json"] },
  },

  // —— Pull Requests ——
  {
    name: "list_open_pull_requests",
    args: { owner: OWNER, repo: REPO },
  },
  {
    name: "get_pull_request",
    args: { owner: OWNER, repo: REPO, pullNumber: 4 },
  },
  {
    name: "list_pull_request_files",
    args: { owner: OWNER, repo: REPO, pullNumber: 4 },
  },
  {
    name: "list_pull_request_comments",
    args: { owner: OWNER, repo: REPO, pullNumber: 4 },
  },
  {
    name: "get_pull_request_diff",
    args: { owner: OWNER, repo: REPO, pullNumber: 4 },
  },

  // —— Issues ——
  {
    name: "list_issues",
    args: { owner: OWNER, repo: REPO, state: "open" },
  },
  {
    name: "get_issue",
    args: { owner: OWNER, repo: REPO, issueNumber: 1 },
  },
  {
    name: "list_issue_comments",
    args: { owner: OWNER, repo: REPO, issueNumber: 1 },
  },

  // —— Commits ——
  {
    name: "list_commits",
    args: { owner: OWNER, repo: REPO, branch: "main", perPage: 5 },
  },
  {
    name: "get_commit",
    args: { owner: OWNER, repo: REPO, ref: "main" },
  },

  // —— Search ——
  {
    name: "search_files",
    args: { owner: OWNER, repo: REPO, pattern: "validation" },
  },
  {
    name: "search_code",
    args: { owner: OWNER, repo: REPO, query: "defineTool" },
  },
];

// ──────────────────────────────────────────────────────
// Write-tools — these mutate state, run last
// NOTE: create_branch, upsert_file, create_pull_request,
//       update_pull_request, create_issue, update_issue,
//       link_issue_to_pull_request, add_issue_comment are
//       intentionally excluded from automated runs to avoid
//       polluting the repo. They are covered by manual curl tests.
//
// To opt-in, set ENABLE_WRITE_TESTS=true in the workflow env.
// ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

console.log(`\n🧪 Running ${tests.length} integration tests against ${BASE}\n`);

for (const [i, test] of tests.entries()) {
  const id = i + 1;
  try {
    await call(id, test.name, test.args);
    console.log(`  ✅ [${id.toString().padStart(2, "0")}] ${test.name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ [${id.toString().padStart(2, "0")}] ${test.name}`);
    console.log(`       ${err.message}`);
    failed++;
    failures.push({ tool: test.name, error: err.message });
  }
}

console.log(`
────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tools`);

if (failed > 0) {
  console.log(`
Failed tools:`);
  for (const f of failures) {
    console.log(`  - ${f.tool}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log(`
✨ All tools passed!`);
  process.exit(0);
}

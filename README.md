# github-mcp-bridge

A lightweight TypeScript MCP (Model Context Protocol) server for GitHub. It exposes GitHub operations as MCP tools over HTTP, so any MCP-compatible client can interact with GitHub repositories without needing a built-in GitHub connector.

The GitHub PAT lives server-side only. Clients authenticate to the bridge using a shared `CONNECTOR_SECRET`.

## How it works

```
MCP Client  ──bearer token──▶  github-mcp-bridge  ──GitHub PAT──▶  GitHub API
```

1. The client sends a JSON-RPC 2.0 `tools/call` request to the bridge with a bearer token
2. The bridge validates the token against `CONNECTOR_SECRET` (timing-safe, with rate limiting)
3. The bridge selects the correct PAT for the request owner (with fallback to the default) and calls the GitHub API

The bridge also exposes `tools/list` so any client can discover all available tools and their input schemas at runtime — no manual tool configuration needed.

## Available tools

### Repositories

| Tool                | Description                                        |
| ------------------- | -------------------------------------------------- |
| `list_repositories` | List repositories accessible to the configured PAT |

### Branches

| Tool            | Description                                                                    |
| --------------- | ------------------------------------------------------------------------------ |
| `list_branches` | List branches for a repository                                                 |
| `get_branch`    | Get branch details including latest commit SHA, message, and protection status |
| `create_branch` | Create a branch from an existing base branch                                   |

### Files

| Tool                 | Description                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_file_contents`  | Get the contents of a file in a repository. Files larger than 3.5 MB are truncated — check the `truncated` flag in the response                                    |
| `get_multiple_files` | Get the contents of multiple files in a repository. Results are paginated — when `hasMore` is true, call again with `nextCursor` to fetch the next page            |
| `list_directory`     | List files and directories at a repository path                                                                                                                    |
| `upsert_file`        | Create or update a file in a repository branch                                                                                                                     |
| `patch_file`         | Apply targeted text patches to a file without replacing the entire content. Supports `replace_once`, `replace_all`, `insert_before`, and `insert_after` operations |
| `delete_file`        | Delete a single file from a branch                                                                                                                                 |

### Pull Requests

| Tool                         | Description                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `list_open_pull_requests`    | List open pull requests for a repository                                           |
| `list_pull_requests`         | List pull requests filtered by state (`open`, `closed`, `all`). Defaults to `open` |
| `get_pull_request`           | Get a pull request by number                                                       |
| `list_pull_request_files`    | List files changed in a pull request, including patches                            |
| `list_pull_request_comments` | List inline and general comments on a pull request                                 |
| `get_pull_request_reviews`   | List reviews submitted on a pull request                                           |
| `get_pull_request_diff`      | Get the full unified diff for a pull request                                       |
| `create_pull_request`        | Create a pull request                                                              |
| `update_pull_request`        | Update a pull request (title, body, state, base branch)                            |

### Issues

| Tool                         | Description                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `list_issues`                | List issues for a repository, filtered by state (`open`, `closed`, `all`). Excludes pull requests                      |
| `get_issue`                  | Get a single issue by number                                                                                           |
| `create_issue`               | Create a new issue                                                                                                     |
| `update_issue`               | Update an existing issue (title, body, state, labels, assignees)                                                       |
| `link_issue_to_pull_request` | Link an issue to a PR using a closing keyword (`closes`/`fixes`/`resolves`). GitHub will auto-close the issue on merge |
| `list_issue_comments`        | List all comments on an issue                                                                                          |
| `add_issue_comment`          | Post a comment on an issue                                                                                             |

### Commits

| Tool           | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `list_commits` | List commits for a repository, optionally filtered by branch or file path    |
| `get_commit`   | Get full commit detail by SHA or ref, including changed files and diff stats |

### Search

| Tool           | Description                                                                   |
| -------------- | ----------------------------------------------------------------------------- |
| `search_code`  | Search for code within a repository — returns file paths and match fragments  |
| `search_files` | Search for files by name or path pattern using the git tree (no query limits) |

## Getting started

### Prerequisites

- Node.js >= 24
- A GitHub Personal Access Token with `repo` scope (or a fine-grained PAT scoped to the repositories you need)

### Local development

```bash
# 1. Clone the repo
git clone https://github.com/SamNewhouse/github-mcp-bridge.git
cd github-mcp-bridge

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and fill in GITHUB_PAT and CONNECTOR_SECRET

# 4. Start the dev server (hot-reloads on change)
npm run dev
```

The server starts on `http://localhost:3000` by default (configurable via `PORT` in `.env`).

### Environment variables

| Variable           | Required | Description                                                                                                                                                                       |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`              | ✅       | Default GitHub PAT — used for any owner that has no dedicated entry                                                                                                               |
| `GITHUB_PAT_<OWNER>`      | ✗        | Owner-specific PAT. The owner name is **uppercased** and **hyphens replaced with underscores** to form the key — e.g. `Kelvast` → `GITHUB_PAT_KELVAST`, `my-org` → `GITHUB_PAT_MY_ORG`. Add as many as you need. Falls back to `GITHUB_PAT` if no match is found. |
| `CONNECTOR_SECRET`        | ✅       | Shared secret used to authenticate requests to the bridge. Minimum 32 characters — generate with `openssl rand -hex 32`. Supports comma-separated list for zero-downtime rotation |
| `PORT`                    | ✗        | HTTP port (default: `3000`)                                                                                                                                                       |

## Deploying

The bridge is a standard Node.js HTTP server. It can be deployed anywhere that runs Node.js.

Set the three environment variables (`GITHUB_PAT`, `CONNECTOR_SECRET`, and optionally `PORT`) in your hosting environment, then run:

```bash
npm run build
npm start
```

Once deployed, use the root URL as the MCP endpoint and point your client at it.

## Verifying the server

### Health check

```bash
curl -H "Authorization: Bearer $CONNECTOR_SECRET" http://localhost:3000/health
# {"ok":true}
```

### Discover all tools

```bash
curl -s -X POST http://localhost:3000 \
  -H "Authorization: Bearer $CONNECTOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Call a tool

```bash
curl -s -X POST http://localhost:3000 \
  -H "Authorization: Bearer $CONNECTOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_branches",
      "arguments": {
        "owner": "your-org",
        "repo": "your-repo"
      }
    }
  }'
```

## Connecting an MCP client

Configure your MCP client with:

| Setting       | Value                         |
| ------------- | ----------------------------- |
| **URL**       | Your deployment URL           |
| **Auth type** | Bearer token / API key        |
| **Secret**    | Your `CONNECTOR_SECRET` value |

The client can call `tools/list` at any time to discover all available tools and their input schemas dynamically.

## Security

### Authentication

Every request (including `/health` and `HEAD /`) requires a valid `CONNECTOR_SECRET` provided as:

- `Authorization: Bearer <secret>` header, or
- `X-Api-Key: <secret>` header

Secret comparison uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.

### Secret rotation

`CONNECTOR_SECRET` supports zero-downtime rotation via a comma-separated list:

```bash
CONNECTOR_SECRET="newSecret,oldSecret"
```

A request is authorised if it matches **any** entry. Once all clients have rotated to the new secret, remove the old one.

### Rate limiting

Failed authentication attempts are tracked per IP in-memory. After **10 failures** within a 15-minute window, the IP is blocked for **15 minutes**. The counter resets on successful authentication.

> **Note:** The rate limiter is per-process. On serverless runtimes (Vercel), each cold start gets a fresh counter. For persistent cross-instance enforcement, swap the in-memory store for Vercel KV or Redis.

### Security headers

The public splash page (`GET /`) is served with:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`

### Best practices

- Keep `GITHUB_PAT` server-side only — never expose it to clients
- Use a fine-grained PAT with the minimum repository permissions needed
- Use a minimum 32-character random `CONNECTOR_SECRET` — generate with `openssl rand -hex 32`
- Rotate `CONNECTOR_SECRET` immediately if it is ever exposed
- Rotate `GITHUB_PAT` immediately if it is ever exposed
- Never log or commit secrets

## Scripts

| Command                    | Description                        |
| -------------------------- | ---------------------------------- |
| `npm run dev`              | Start dev server with hot-reload   |
| `npm run build`            | Compile TypeScript to `dist/`      |
| `npm start`                | Run compiled server from `dist/`   |
| `npm test`                 | Run all tests (unit + integration) |
| `npm run test:unit`        | Run unit tests only                |
| `npm run test:integration` | Run integration tests only         |
| `npm run typecheck`        | Type-check without emitting        |
| `npm run format`           | Format code with Prettier          |

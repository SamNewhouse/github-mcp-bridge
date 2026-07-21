# github-mcp-bridge

A lightweight TypeScript MCP (Model Context Protocol) server for GitHub. It exposes GitHub operations as MCP tools over HTTP, so any MCP-compatible client can interact with GitHub repositories without needing a built-in GitHub connector.

The GitHub PAT lives server-side only. Clients authenticate to the bridge using a shared secret.

## How it works

```
MCP Client  ──bearer token──▶  github-mcp-bridge  ──GitHub PAT──▶  GitHub API
```

1. The client sends a JSON-RPC 2.0 `tools/call` request to the bridge with a bearer token
2. The bridge validates the token against `CONNECTOR_SECRET`
3. The bridge calls the GitHub API using `GITHUB_PAT` and returns the result

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

| Tool                 | Description                                        |
| -------------------- | -------------------------------------------------- |
| `get_file_contents`  | Get the contents of a file in a repository         |
| `get_multiple_files` | Get the contents of multiple files in a repository |
| `list_directory`     | List files and directories at a repository path    |
| `upsert_file`        | Create or update a file in a repository branch     |

### Pull Requests

| Tool                         | Description                              |
| ---------------------------- | ---------------------------------------- |
| `list_open_pull_requests`    | List open pull requests for a repository |
| `get_pull_request`           | Get a pull request by number             |
| `list_pull_request_files`    | List files changed in a pull request     |
| `list_pull_request_comments` | List comments on a pull request          |
| `get_pull_request_diff`      | Get the unified diff for a pull request  |
| `create_pull_request`        | Create a pull request                    |
| `update_pull_request`        | Update a pull request                    |

### Issues

| Tool                         | Description                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| `list_issues`                | List issues for a repository (excludes pull requests)                 |
| `get_issue`                  | Get a single issue by number                                          |
| `create_issue`               | Create a new issue                                                    |
| `update_issue`               | Update an existing issue (title, body, state, labels, assignees)      |
| `link_issue_to_pull_request` | Link an issue to a PR using a closing keyword (closes/fixes/resolves) |
| `list_issue_comments`        | List all comments on an issue                                         |
| `add_issue_comment`          | Post a comment on an issue                                            |

### Commits

| Tool           | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `list_commits` | List commits, optionally filtered by branch or file path                     |
| `get_commit`   | Get full commit detail by SHA or ref, including changed files and diff stats |

### Search

| Tool           | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `search_code`  | Search for code within a repository — returns file paths and match fragments |
| `search_files` | Search for files by name or path pattern using the git tree                  |

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

| Variable           | Required | Description                                               |
| ------------------ | -------- | --------------------------------------------------------- |
| `GITHUB_PAT`       | ✅       | GitHub Personal Access Token                              |
| `CONNECTOR_SECRET` | ✅       | Shared secret used to authenticate requests to the bridge |
| `PORT`             | ✗        | HTTP port (default: `3000`)                               |

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
curl http://localhost:3000/health
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

## Scripts

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `npm run dev`    | Start dev server with hot-reload |
| `npm run build`  | Compile TypeScript to `dist/`    |
| `npm start`      | Run compiled server from `dist/` |
| `npm test`       | Type-check without emitting      |
| `npm run format` | Format code with Prettier        |

## Security

- Keep `GITHUB_PAT` server-side only — never expose it to clients
- Use a fine-grained PAT with the minimum repository permissions needed
- Use a long random string for `CONNECTOR_SECRET` (e.g. `openssl rand -base64 32`)
- Rotate `CONNECTOR_SECRET` immediately if it is ever exposed
- Rotate `GITHUB_PAT` immediately if it is ever exposed
- Never log or commit secrets

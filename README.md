# github-mcp-bridge

A lightweight TypeScript MCP server for GitHub. It exposes GitHub operations as MCP tools over HTTP while keeping GitHub credentials server-side.

![github-mcp-bridge status](https://raw.githubusercontent.com/SamNewhouse/github-mcp-bridge/2621e1aff8c4b336521ab452f5b94ac9cdcb2675/image.png)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create local configuration

Copy the example environment file:

```bash
cp .env.example .env
```

### 3. Create your connector token

`CONNECTOR_SECRET` is a secret token that you generate yourself. It has two purposes:

- You add it to your local `.env` file and to your Vercel project environment variables.
- Your MCP client sends it when connecting to the bridge, using either an `Authorization: Bearer` header or an `X-Api-Key` header.

It is not supplied by GitHub, Vercel, or Upstash Redis.

Generate a token:

```bash
openssl rand -hex 64
```

Copy the generated value into `.env` with your GitHub token:

```bash
# Required for local development
GITHUB_PAT=ghp_xxx
CONNECTOR_SECRET=your-generated-token

# Optional
PORT=3000
```

Keep both values private. `GITHUB_PAT` authenticates the bridge to GitHub. `CONNECTOR_SECRET` authenticates an MCP client to your local or Vercel-hosted bridge.

### 4. Start the server

```bash
npm run dev
```

The local server listens on `http://localhost:3000` by default.

## Environment Variables

| Variable             | Required | Description                                                                                                                            |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`         | Yes      | Default GitHub Personal Access Token used when no owner-specific token exists                                                          |
| `GITHUB_PAT_<OWNER>` | No       | Owner-specific GitHub token. The owner is uppercased and hyphens become underscores; for example, `my-org` maps to `GITHUB_PAT_MY_ORG` |
| `CONNECTOR_SECRET`   | Yes      | Self-generated connector token. Add it to Vercel and use the same value when authenticating an MCP client to the hosted bridge         |
| `PORT`               | No       | HTTP port. Defaults to `3000`                                                                                                          |

Owner-specific token selection falls back to `GITHUB_PAT` when no matching `GITHUB_PAT_<OWNER>` variable is configured.

## Deployment

### 1. Create a Vercel project

Import this repository into Vercel and configure the production branch.

### 2. Add Upstash Redis

In the Vercel project, open **Storage**, add **Upstash Redis**, and connect it to the project.

The Vercel integration supplies the Upstash Redis connection variables automatically. Do not copy Redis credentials into `.env`, GitHub Actions, or MCP client configuration.

### 3. Add Vercel environment variables

Add these variables in **Vercel → Project → Settings → Environment Variables**:

```text
GITHUB_PAT
CONNECTOR_SECRET
```

Use your GitHub Personal Access Token as `GITHUB_PAT`.

Generate `CONNECTOR_SECRET` locally:

```bash
openssl rand -hex 64
```

Add the generated value to Vercel as `CONNECTOR_SECRET`. This exact value becomes the token required by every MCP client connecting to your hosted bridge.

### 4. Deploy

Push the branch to GitHub or deploy from the Vercel dashboard.

The deployment uses Upstash Redis for session continuity across Vercel's serverless instances. Local development and CI use in-memory sessions and do not contact Redis.

## Sessions

Sessions are bound to the authenticated caller; they provide request continuity and do not replace authentication.

- Sessions expire after 2 hours without a valid request.
- Sessions cannot live longer than 12 hours from creation.
- Each valid request refreshes the idle window without extending the maximum lifetime.
- `initialize`, `notifications/initialized`, and `ping` are supported.
- The server can maintain session continuity without requiring every client to manage an `Mcp-Session-Id` header manually.

## Available Tools

The bridge currently exposes **37 tools**. Call `tools/list` to obtain the authoritative tool definitions and input schemas at runtime.

### Repositories

| Tool                | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `list_repositories` | List repositories accessible to the configured GitHub token |
| `get_repository`    | Get details of a repository                                 |

### Branches

| Tool            | Description                                     |
| --------------- | ----------------------------------------------- |
| `list_branches` | List repository branches                        |
| `get_branch`    | Get branch details, including its latest commit |
| `create_branch` | Create a branch from an existing branch         |

### Files

| Tool                 | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `get_file_contents`  | Read a file with metadata; content larger than 3.5 MB is truncated |
| `read_file`          | Read decoded raw text from a file                                  |
| `get_multiple_files` | Read multiple files with cursor pagination                         |
| `list_directory`     | List a repository directory                                        |
| `upsert_file`        | Create or replace a file in a branch                               |
| `batch_upsert_files` | Create or replace multiple files in one commit                     |
| `create_commit`      | Write multiple files in one commit                                 |
| `patch_file`         | Apply targeted text patches without replacing the entire file      |
| `delete_file`        | Delete a file from a branch                                        |

### Pull Requests

| Tool                         | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `list_open_pull_requests`    | List open pull requests                                    |
| `list_pull_requests`         | List pull requests by state                                |
| `get_pull_request`           | Get pull request details                                   |
| `list_pull_request_files`    | List files changed by a pull request                       |
| `list_pull_request_comments` | List pull request conversation comments                    |
| `get_pull_request_reviews`   | List pull request reviews                                  |
| `get_pull_request_diff`      | Get a pull request's unified diff                          |
| `create_pull_request`        | Create a pull request                                      |
| `update_pull_request`        | Update a pull request's title, body, state, or base branch |
| `add_pull_request_comment`   | Add a conversation comment to a pull request               |

### Issues

| Tool                         | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `list_issues`                | List issues by state, excluding pull requests               |
| `get_issue`                  | Get issue details                                           |
| `create_issue`               | Create an issue                                             |
| `update_issue`               | Update an issue's title, body, state, labels, or assignees  |
| `link_issue_to_pull_request` | Add a closing keyword that links an issue to a pull request |
| `list_issue_comments`        | List comments on an issue                                   |
| `add_issue_comment`          | Add a comment to an issue                                   |

### Commits

| Tool           | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `list_commits` | List commits, optionally filtered by branch or path        |
| `get_commit`   | Get commit details, including changed files and diff stats |

### Actions

| Tool                 | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| `list_workflow_runs` | List workflow runs, optionally filtered by branch, event, or status |
| `get_workflow_run`   | Get workflow-run details, including jobs and steps                  |

### Search

| Tool           | Description                                              |
| -------------- | -------------------------------------------------------- |
| `search_code`  | Search code and return matching file paths and fragments |
| `search_files` | Search file names and paths through the repository tree  |

## Tool Requests

All repository-scoped tools require `owner` and `repo`. `list_repositories` is the exception because it lists repositories available to the configured token.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_branches",
    "arguments": {
      "owner": "SamNewhouse",
      "repo": "github-mcp-bridge"
    }
  }
}
```

## Connecting an MCP Client

Use your local server URL or Vercel deployment URL as the MCP endpoint.

Authenticate every request with the same `CONNECTOR_SECRET` value that you added to `.env` locally or to Vercel in production.

```text
Authorization: Bearer <CONNECTOR_SECRET>
```

Alternatively:

```text
X-Api-Key: <CONNECTOR_SECRET>
```

For example, if Vercel contains:

```text
CONNECTOR_SECRET=abc123...
```

your MCP client must send:

```text
Authorization: Bearer abc123...
```

The bridge validates the connector token using timing-safe comparison and rate-limits repeated failed authentication attempts.

## Testing

```bash
npm test
npm run test:unit
npm run test:integration
npm run typecheck
```

The project currently has 19 test suites and 238 passing tests.

## Scripts

| Command                    | Description                                  |
| -------------------------- | -------------------------------------------- |
| `npm run dev`              | Start the development server with hot reload |
| `npm run build`            | Compile TypeScript to `dist`                 |
| `npm start`                | Run the compiled server                      |
| `npm test`                 | Run unit and integration tests               |
| `npm run test:unit`        | Run unit tests                               |
| `npm run test:integration` | Run integration tests                        |
| `npm run typecheck`        | Type-check without emitting files            |
| `npm run format`           | Format the project with Prettier             |

## Security

- Keep `GITHUB_PAT` server-side only.
- Do not expose Upstash Redis credentials to MCP clients.
- Do not commit `.env` files, GitHub tokens, Redis credentials, or `CONNECTOR_SECRET`.
- Use the minimum GitHub PAT permissions required.
- Rotate `CONNECTOR_SECRET` and `GITHUB_PAT` immediately if either is exposed.

## License

MIT

---

**Note:** This line was added during MCP Bridge tooling test on 2026-09-20.

# github-mcp-bridge

A tiny TypeScript MCP bridge for GitHub.

It exposes a small set of GitHub tools over MCP so clients like Perplexity can discover repositories, inspect branches and pull requests, and create branches without relying on the built-in GitHub connector.

## Features

- `list_repositories`
- `list_branches`
- `list_open_pull_requests`
- `create_branch`
- No hardcoded orgs or repo names
- GitHub PAT stored server-side in environment variables
- Shared-secret auth for the bridge
- Small enough to deploy on Vercel

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
GITHUB_PAT=ghp_your_token_here
CONNECTOR_SECRET=your_shared_secret_here
PORT=3000
```

## Local development

```bash
npm install
npm run lint
npm run dev
```

The local HTTP server runs on `http://localhost:3000/mcp` by default.

## Deploy to Vercel

1. Import the repo into Vercel.
2. Add `GITHUB_PAT` and `CONNECTOR_SECRET` as environment variables.
3. Deploy.
4. Use `https://your-project.vercel.app/mcp` as the remote MCP URL.

## Connect to Perplexity

Perplexity custom connectors use a remote MCP server URL and support API key style authentication [page:1].

Use:

- URL: `https://your-project.vercel.app/mcp`
- Authentication: API Key
- API key value: your `CONNECTOR_SECRET`

## Security notes

- Keep `GITHUB_PAT` server-side only.
- Prefer a fine-grained PAT with the minimum repository access needed.
- Rotate `CONNECTOR_SECRET` if it is ever shared.
- Never expose secrets in frontend code or logs.

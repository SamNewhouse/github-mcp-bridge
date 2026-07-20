# github-mcp-bridge

A tiny TypeScript MCP bridge for GitHub.

It exposes a small set of GitHub tools over MCP so clients can discover repositories, inspect branches and pull requests, and create branches without relying on a built-in GitHub connector.

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

The local HTTP server runs on `http://localhost:3000/` by default.

Health check:

```bash
curl -i http://localhost:3000/health
```

MCP manifest:

```bash
curl -i \
  -H "Authorization: Bearer $CONNECTOR_SECRET" \
  http://localhost:3000/
```

Tool call:

```bash
curl -i \
  -H "Authorization: Bearer $CONNECTOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "list_branches",
    "input": {
      "owner": "vercel",
      "repo": "next.js"
    }
  }' \
  http://localhost:3000/
```

## Deploy to Vercel

1. Import the repo into Vercel.
2. Add `GITHUB_PAT` and `CONNECTOR_SECRET` as environment variables.
3. Optionally add a custom domain.
4. Deploy.

Use the root URL as the remote MCP server URL:

```txt
https://your-custom-domain.example/
```

If you use the default Vercel domain instead, use:

```txt
https://your-project.vercel.app/
```

Health check:

```txt
https://your-custom-domain.example/health
```

## Connect a client

Any compatible client can connect to the deployed endpoint using the server URL and a shared secret.

Use:

- URL: `https://your-custom-domain.example/`
- Authentication: API key or bearer token
- Secret value: your `CONNECTOR_SECRET`

## Example curl

Set your secret in the shell:

```bash
export CONNECTOR_SECRET="your_shared_secret_here"
```

Fetch the MCP manifest:

```bash
curl -i \
  -H "Authorization: Bearer $CONNECTOR_SECRET" \
  https://your-custom-domain.example/
```

Run a tool:

```bash
curl -i \
  -H "Authorization: Bearer $CONNECTOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "list_branches",
    "input": {
      "owner": "vercel",
      "repo": "next.js"
    }
  }' \
  https://your-custom-domain.example/
```

## Security notes

- Keep `GITHUB_PAT` server-side only.
- Prefer a fine-grained PAT with the minimum repository access needed.
- Rotate `CONNECTOR_SECRET` if it is ever shared.
- Rotate `GITHUB_PAT` immediately if it is ever exposed.
- Never expose secrets in frontend code, client-side config, screenshots, or logs.

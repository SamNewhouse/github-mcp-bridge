// ---------------------------------------------------------------------------
// Splash page components
// Each function returns an HTML string fragment. Compose them in getSplashHtml.
// ---------------------------------------------------------------------------

function splashHead(): string {
  return `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>github-mcp-bridge</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :root {
        --bg: #0d0d0d;
        --surface: #141414;
        --border: rgba(255,255,255,0.08);
        --text: #e8e8e6;
        --muted: #6b6b68;
        --faint: #3a3a38;
        --accent: #4f98a3;
        --green: #6daa45;
        --radius: 0.5rem;
      }
      html { -webkit-font-smoothing: antialiased; }
      body {
        min-height: 100dvh;
        background: var(--bg);
        color: var(--text);
        font-family: 'Geist', system-ui, sans-serif;
        display: grid;
        place-items: center;
        padding: 2rem 1.5rem;
      }
      .card {
        width: 100%;
        max-width: 480px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: calc(var(--radius) * 2);
        padding: 2.5rem;
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }
      .divider { height: 1px; background: var(--border); }
    </style>
  </head>`;
}

function splashLogo(): string {
  return `
  <style>
    .logo { display: flex; align-items: center; gap: 0.875rem; }
    .logo-text { display: flex; flex-direction: column; gap: 0.1rem; }
    .logo-name { font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
    .logo-sub { font-size: 0.75rem; color: var(--muted); font-family: 'Geist Mono', monospace; }
  </style>
  <div class="logo">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="github-mcp-bridge logo">
      <rect width="40" height="40" rx="10" fill="#1a1a1a"/>
      <path d="M6 26 Q13 14 20 26" stroke="#4f98a3" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M20 26 Q27 14 34 26" stroke="#4f98a3" stroke-width="2" stroke-linecap="round" fill="none"/>
      <line x1="4" y1="26" x2="36" y2="26" stroke="#4f98a3" stroke-width="2" stroke-linecap="round"/>
      <line x1="13" y1="26" x2="13" y2="30" stroke="#4f98a3" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="20" y1="26" x2="20" y2="30" stroke="#4f98a3" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="27" y1="26" x2="27" y2="30" stroke="#4f98a3" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="20" cy="13" r="2.5" fill="#6daa45"/>
    </svg>
    <div class="logo-text">
      <span class="logo-name">github-mcp-bridge</span>
      <span class="logo-sub">Model Context Protocol Server</span>
    </div>
  </div>`;
}

function splashStatus(): string {
  return `
  <style>
    .status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--green); font-family: 'Geist Mono', monospace; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse 2.4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  </style>
  <div class="status">
    <div class="status-dot"></div>
    operational
  </div>`;
}

function splashMeta(toolCount: number): string {
  return `
  <style>
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .meta-item { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem 1rem; }
    .meta-label { font-size: 0.6875rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.3rem; font-family: 'Geist Mono', monospace; }
    .meta-value { font-size: 0.9375rem; font-weight: 500; color: var(--text); font-family: 'Geist Mono', monospace; }
    .meta-value.accent { color: var(--accent); }
  </style>
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Tools</div>
      <div class="meta-value accent">${toolCount}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Protocol</div>
      <div class="meta-value">MCP 2025</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Transport</div>
      <div class="meta-value">HTTP/JSON-RPC</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Runtime</div>
      <div class="meta-value">Node 24</div>
    </div>
  </div>`;
}

function splashFooter(): string {
  return `
  <style>
    .footer { font-size: 0.75rem; color: var(--faint); text-align: center; font-family: 'Geist Mono', monospace; line-height: 1.6; }
    .footer a { color: var(--muted); text-decoration: none; transition: color 180ms ease; }
    .footer a:hover { color: var(--accent); }
  </style>
  <div class="footer">
    Requests require a valid <code>Authorization: Bearer</code> token<br>
    <a href="https://github.com/SamNewhouse/github-mcp-bridge" target="_blank" rel="noopener noreferrer">github.com/SamNewhouse/github-mcp-bridge</a>
  </div>`;
}

// ---------------------------------------------------------------------------
// Compose all components into the final page
// ---------------------------------------------------------------------------

export function getSplashHtml(toolCount: number): string {
  return `<!DOCTYPE html>
<html lang="en">
${splashHead()}
<body>
  <div class="card">
    ${splashLogo()}
    <div class="divider"></div>
    ${splashStatus()}
    ${splashMeta(toolCount)}
    <div class="divider"></div>
    ${splashFooter()}
  </div>
</body>
</html>`;
}

import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { config } from "dotenv";

// Load .env so CONNECTOR_SECRET and GITHUB_PAT are available to both
// the test process and the spawned server process.
config();

export default async function globalSetup() {
  const port = process.env.PORT ?? "3000";

  // Build first so dist/server.js is guaranteed to exist before spawning.
  const build = spawnSync("npm run build", {
    shell: true,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    throw new Error("[setup] Build failed — cannot start integration server");
  }

  const server: ChildProcess = spawn("node", ["dist/src/server.js"], {
    env: {
      ...process.env,
      PORT: port,
    },
    stdio: "pipe",
  });

  // Store on global so teardown.ts can access it
  (global as any).__integrationServer = server;

  server.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[server] ${data.toString()}`);
  });

  // Poll /health until the server is ready (max 10s)
  const url = `http://localhost:${port}/health`;
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[setup] Server ready on port ${port}`);
        return;
      }
    } catch {
      // Not ready yet
    }
    await setTimeout(200);
  }

  server.kill();
  throw new Error("[setup] Server did not become ready within 10s");
}

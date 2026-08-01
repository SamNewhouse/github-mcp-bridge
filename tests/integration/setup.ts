import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { config } from "dotenv";

config();

export default async function globalSetup() {
  const port = process.env.PORT ?? "3000";
  const connectorSecret = process.env.CONNECTOR_SECRET;

  if (!connectorSecret) {
    throw new Error("[setup] CONNECTOR_SECRET is required");
  }

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
      MCP_SESSION_IDLE_TTL_MS: process.env.MCP_SESSION_IDLE_TTL_MS ?? "7200000",
      MCP_SESSION_MAX_TTL_MS: process.env.MCP_SESSION_MAX_TTL_MS ?? "43200000",
    },
    stdio: "pipe",
  });

  (global as any).__integrationServer = server;

  server.stderr?.on("data", (data: Buffer) => {
    process.stderr.write(`[server] ${data.toString()}`);
  });

  const url = `http://localhost:${port}/health`;
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${connectorSecret}`,
        },
      });

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

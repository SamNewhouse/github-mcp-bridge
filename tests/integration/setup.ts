import { spawn, ChildProcess } from "node:child_process";
import { setTimeout } from "node:timers/promises";

let server: ChildProcess | null = null;

export default async function globalSetup() {
  const port = process.env.PORT ?? "3000";

  server = spawn("node", ["dist/server.js"], {
    env: {
      ...process.env,
      PORT: port,
    },
    stdio: "pipe",
  });

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

export async function globalTeardown() {
  if (server) {
    server.kill();
    server = null;
    console.log("[teardown] Server stopped");
  }
}

export default async function globalTeardown() {
  const server = (global as any).__integrationServer;
  if (server) {
    server.kill();
    console.log("[teardown] Server stopped");
  }
}

import * as http from "node:http";
import { getPort } from "./config";
import { handleMcpRequest } from "./app";

const server = http.createServer(handleMcpRequest);
const port = getPort();

server.listen(port, () => {
  console.log(`github-mcp-bridge listening on http://localhost:${port}/mcp`);
});

import "dotenv/config";
import * as http from "node:http";
import { getPort, validateGithubPats } from "./config";
import { handleMcpRequest } from "./router";

validateGithubPats();

const server = http.createServer(handleMcpRequest);
const port = getPort();

server.listen(port, () => {
  console.log(`github-mcp-bridge listening on http://localhost:${port}/`);
});

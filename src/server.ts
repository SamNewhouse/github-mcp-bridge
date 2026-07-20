import * as http from "node:http";
import { env } from "./config";
import { handleMcpRequest } from "./app";

const server = http.createServer(handleMcpRequest);

server.listen(env.PORT, () => {
  console.log(
    `github-mcp-bridge listening on http://localhost:${env.PORT}/mcp`,
  );
});

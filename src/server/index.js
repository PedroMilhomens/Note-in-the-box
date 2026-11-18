import http from "node:http";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";

const config = loadConfig();

export function createServer() {
  return http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/api/saude") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ erro: "não encontrado", codigo: "NAO_ENCONTRADO" }));
  });
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    process.stdout.write(`Servidor iniciado em http://${config.host}:${config.port}\n`);
  });
}

import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { Router } from "../../src/server/router.js";
import { createServer } from "../../src/server/index.js";
import { json } from "../../src/server/http/json.js";
import { readJson } from "../../src/server/http/body.js";

const expectedSecurityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

async function listen(server, context) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(expectedSecurityHeaders)) {
    assert.equal(response.headers.get(name), value, `${name} header`);
  }
}

function rawGet(port, target) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let responseText = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      responseText += chunk;
    });
    socket.once("error", reject);
    socket.once("end", () => resolve(responseText));
    socket.once("connect", () => {
      socket.end(
        `GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
      );
    });
  });
}

test("roteia parâmetros, ignora query e aplica cabeçalhos de segurança", async (context) => {
  const router = new Router();
  router.add("GET", "/api/classes/:classId", (request, response, params) => {
    json(response, 200, params);
  });

  const server = createServer({ router });
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.requestTimeout, 30_000);
  const baseUrl = await listen(server, context);
  const response = await fetch(`${baseUrl}/api/classes/classe-1?campo=privado`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { classId: "classe-1" });
  assertSecurityHeaders(response);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("JSON acima de 1 MB retorna 413 e headers de segurança", async (context) => {
  const router = new Router();
  router.add("POST", "/api/echo", async (request, response) => {
    json(response, 200, await readJson(request));
  });
  const server = createServer({ router });
  const baseUrl = await listen(server, context);
  const response = await fetch(`${baseUrl}/api/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(1024 * 1024) }),
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    erro: "corpo da requisição muito grande",
    codigo: "CORPO_MUITO_GRANDE",
  });
  assertSecurityHeaders(response);
});

test("JSON malformado retorna erro curto sem detalhes internos", async (context) => {
  const router = new Router();
  router.add("POST", "/api/echo", async (_request, response, _params, { readJson }) => {
    json(response, 200, await readJson());
  });
  const server = createServer({ router });
  const baseUrl = await listen(server, context);
  const response = await fetch(`${baseUrl}/api/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    erro: "JSON inválido",
    codigo: "JSON_INVALIDO",
  });
  assertSecurityHeaders(response);
});

test("conteúdo estático vem apenas de public e traversal não revela arquivos", async (context) => {
  const server = createServer();
  const baseUrl = await listen(server, context);
  const rootResponse = await fetch(`${baseUrl}/`);
  assert.equal(rootResponse.status, 200);
  assertSecurityHeaders(rootResponse);
  assert.match(await rootResponse.text(), /EM BREVE!/);

  const hiddenResponse = await fetch(`${baseUrl}/.env`);
  assert.equal(hiddenResponse.status, 404);
  assertSecurityHeaders(hiddenResponse);

  const { port } = new URL(baseUrl);
  for (const traversalPath of ["/%2e%2e/.env", "/..%2f.env"]) {
    const traversalResponse = await rawGet(Number(port), traversalPath);
    assert.match(traversalResponse, /^HTTP\/1\.1 400 Bad Request/);
    assert.match(traversalResponse, /content-security-policy: default-src 'self'/i);
    assert.doesNotMatch(traversalResponse, /DATABASE_URL/);
  }
});

test("erros internos têm resposta genérica e log sem dados da requisição", async (context) => {
  const logs = [];
  const router = new Router();
  router.add("POST", "/api/private", () => {
    throw new Error("email=aluno-ficticio@example.test conteúdo privado");
  });

  const server = createServer({
    router,
    logger: (entry) => logs.push(entry),
  });
  const baseUrl = await listen(server, context);
  const response = await fetch(`${baseUrl}/api/private?email=aluno-ficticio@example.test`, {
    method: "POST",
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    erro: "erro interno",
    codigo: "ERRO_INTERNO",
  });
  assertSecurityHeaders(response);
  assert.equal(JSON.stringify(logs).includes("aluno-ficticio@example.test"), false);
  assert.equal(JSON.stringify(logs).includes("conteúdo privado"), false);
  assert.deepEqual(
    Object.keys(logs[0]).sort(),
    ["durationMs", "method", "requestId", "route", "status"].sort(),
  );
  assert.equal(logs[0].route, "POST /api/private");
});

test("erros de parsing HTTP também recebem cabeçalhos de segurança", async (context) => {
  const logs = [];
  const server = createServer({ logger: (entry) => logs.push(entry) });
  const baseUrl = await listen(server, context);
  const { port } = new URL(baseUrl);
  const socket = net.connect(Number(port), "127.0.0.1");
  let responseText = "";
  socket.setEncoding("utf8");

  const responseEnded = new Promise((resolve, reject) => {
    socket.on("data", (chunk) => {
      responseText += chunk;
    });
    socket.once("end", resolve);
    socket.once("error", reject);
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.write("GET / HTTP/1.1\r\nHost: localhost\r\nInvalid Header\r\n\r\n");
  await responseEnded;

  assert.match(responseText, /^HTTP\/1\.1 400 Bad Request/);
  assert.match(responseText, /content-security-policy: default-src 'self'/i);
  assert.match(responseText, /x-content-type-options: nosniff/i);
  assert.deepEqual(logs[0], {
    requestId: logs[0].requestId,
    method: "UNKNOWN",
    route: "client-error",
    status: 400,
    durationMs: 0,
  });
});

test("HSTS é emitido em produção, não em desenvolvimento", async (context) => {
  const productionServer = createServer({
    nodeEnv: "production",
    logger: () => {},
  });
  const productionUrl = await listen(productionServer, context);
  const productionResponse = await fetch(`${productionUrl}/api/saude`);
  assert.equal(
    productionResponse.headers.get("strict-transport-security"),
    "max-age=63072000",
  );

  const developmentServer = createServer({ logger: () => {} });
  const developmentUrl = await listen(developmentServer, context);
  const developmentResponse = await fetch(`${developmentUrl}/api/saude`);
  assert.equal(developmentResponse.headers.get("strict-transport-security"), null);
});

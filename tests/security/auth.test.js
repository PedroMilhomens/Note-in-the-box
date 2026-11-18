import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "../../src/server/router.js";
import { createServer } from "../../src/server/index.js";
import { json } from "../../src/server/http/json.js";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";

test("cadastro permanece bloqueado enquanto documentos legais aguardam validação", async (context) => {
  const router = new Router();
  router.add("POST", "/api/auth/register", (_request, response) => {
    json(response, 201, { status: "created" });
  });
  const server = createServer({
    router,
    appOrigin: null,
    legalDocumentsApproved: false,
    logger: () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    erro: "cadastro indisponível até a validação humana dos documentos",
    codigo: "DOCUMENTOS_PENDENTES",
  });
});

test("login limita tentativas por conta e por IP", async (context) => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const server = createServer({
    pool,
    appOrigin: null,
    rateLimiter: new RateLimiter({ limit: 2, windowMs: 60_000 }),
    logger: () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function attempt(email) {
    return fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({ email, password: "senha-ficticia-forte" }),
    });
  }

  assert.equal((await attempt("aluno@example.test")).status, 401);
  assert.equal((await attempt("aluno@example.test")).status, 401);
  const blocked = await attempt("aluno@example.test");
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), {
    erro: "muitas tentativas; tente novamente mais tarde",
    codigo: "MUITAS_TENTATIVAS",
  });
});

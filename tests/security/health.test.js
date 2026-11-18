import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../../src/server/index.js";

test("rota desconhecida não expõe detalhes internos", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/arquivo/.env`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    erro: "não encontrado",
    codigo: "NAO_ENCONTRADO",
  });
});

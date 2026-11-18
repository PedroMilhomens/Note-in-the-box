import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../../src/server/index.js";

test("GET /api/saude responde 200", async (context) => {
  process.env.NODE_ENV = "test";
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/saude`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

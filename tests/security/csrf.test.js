import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "../../src/server/router.js";
import { createServer } from "../../src/server/index.js";
import { json } from "../../src/server/http/json.js";

test("mutating API rejects cross-origin and missing-origin requests", async (context) => {
  const router = new Router();
  let mutationCount = 0;
  router.add("POST", "/api/change", (_request, response) => {
    mutationCount += 1;
    json(response, 200, { status: "updated" });
  });
  const server = createServer({ router, appOrigin: null, logger: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const crossOrigin = await fetch(`${origin}/api/change`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example.test",
    },
    body: "{}",
  });
  const noOrigin = await fetch(`${origin}/api/change`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const sameOrigin = await fetch(`${origin}/api/change`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: "{}",
  });

  assert.equal(crossOrigin.status, 403);
  assert.equal(noOrigin.status, 403);
  assert.deepEqual(await sameOrigin.json(), { status: "updated" });
  assert.equal(mutationCount, 1);
});

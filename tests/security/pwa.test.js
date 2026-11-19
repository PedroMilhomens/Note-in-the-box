import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerSource = await readFile(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);

function createWorkerHarness() {
  const handlers = new Map();
  const cacheCalls = [];
  const self = {
    location: { origin: "https://app.test" },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
  };
  const caches = {
    async open(name) {
      cacheCalls.push(["open", name]);
      return {
        async match() {
          cacheCalls.push(["match"]);
          return { cached: true };
        },
        async put() {
          cacheCalls.push(["put"]);
        },
      };
    },
  };
  vm.runInNewContext(serviceWorkerSource, {
    URL,
    Request,
    Promise,
    Set,
    caches,
    self,
  });
  return { handlers, cacheCalls };
}

test("service worker never intercepts authenticated API requests", () => {
  const { handlers, cacheCalls } = createWorkerHarness();
  let intercepted = false;
  handlers.get("fetch")({
    request: new Request("https://app.test/api/me"),
    respondWith() {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);
  assert.deepEqual(cacheCalls, []);
});

test("service worker serves only a whitelisted static shell path from cache", () => {
  const { handlers, cacheCalls } = createWorkerHarness();
  let intercepted = false;
  let responsePromise;
  handlers.get("fetch")({
    request: new Request("https://app.test/notes.html?classId=fake"),
    respondWith(response) {
      intercepted = true;
      responsePromise = response;
    },
  });
  assert.equal(intercepted, true);
  return responsePromise.then((response) => {
    assert.equal(response.cached, true);
    assert.deepEqual(cacheCalls, [
      ["open", "note-in-the-box-shell-v1"],
      ["match"],
    ]);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "../../src/server/router.js";

test("router matches method and extracts decoded path parameters", () => {
  const router = new Router();
  const handler = () => {};
  router.add("GET", "/api/classes/:classId/notes/:noteId", handler);

  assert.deepEqual(
    router.match("GET", "/api/classes/class%201/notes/note-2"),
    {
      handler,
      route: "GET /api/classes/:classId/notes/:noteId",
      params: {
        classId: "class 1",
        noteId: "note-2",
      },
    },
  );
  assert.equal(router.match("POST", "/api/classes/class-1/notes/note-2"), null);
});

test("router rejects encoded path separators and malformed escapes", () => {
  const router = new Router();
  router.add("GET", "/api/notes/:noteId", () => {});

  assert.throws(() => router.match("GET", "/api/notes/a%2Fb"), {
    code: "CAMINHO_INVALIDO",
  });
  assert.throws(() => router.match("GET", "/api/notes/%E0%A4%A"), {
    code: "CAMINHO_INVALIDO",
  });
});

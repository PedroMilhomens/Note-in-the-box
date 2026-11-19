import assert from "node:assert/strict";
import test from "node:test";
import { mergePendingMutation } from "../../public/js/offline-store.js";

test("offline edits preserve an unsent create and the original server version", () => {
  const original = {
    key: "user:class:local-note",
    kind: "create",
    baseUpdatedAt: null,
    createdAt: 10,
    fields: { title: "Rascunho", body: "Primeira versão" },
  };
  const next = {
    ...original,
    kind: "update",
    baseUpdatedAt: "2026-03-02T12:30:45.123Z",
    createdAt: 20,
    fields: { title: "Rascunho", body: "Edição mais recente" },
  };

  assert.deepEqual(mergePendingMutation(original, next), {
    ...next,
    kind: "create",
    baseUpdatedAt: null,
    createdAt: 10,
    conflict: null,
  });
});

test("repeated offline updates keep the first server revision as the conflict base", () => {
  const first = {
    key: "user:class:note",
    kind: "update",
    baseUpdatedAt: "2026-03-02T12:30:45.123Z",
    createdAt: 10,
    fields: { title: "Nota", body: "Primeira edição" },
  };
  const next = {
    ...first,
    baseUpdatedAt: "2026-03-02T12:35:45.123Z",
    createdAt: 20,
    fields: { title: "Nota", body: "Edição mais recente" },
  };

  assert.deepEqual(mergePendingMutation(first, next), {
    ...next,
    baseUpdatedAt: first.baseUpdatedAt,
    createdAt: first.createdAt,
    conflict: null,
  });
});

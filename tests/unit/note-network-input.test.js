import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReferenceInput,
  parseReferenceNoteId,
} from "../../src/server/modules/notes/network-routes.js";

test("reference input requires a note UUID and graph root comes from a query parameter", () => {
  const noteId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseReferenceInput({ targetNoteId: noteId }), {
    targetNoteId: noteId,
  });
  assert.equal(parseReferenceNoteId(`?noteId=${noteId}`), noteId);
  assert.throws(() => parseReferenceInput({ targetNoteId: "nota-1" }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseReferenceNoteId("?noteId=nota-1"), {
    code: "NAO_ENCONTRADO",
  });
  assert.throws(() => parseReferenceNoteId(""), {
    code: "NAO_ENCONTRADO",
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNoteInput,
  parseNotePatch,
  parseNotesPagination,
} from "../../src/server/modules/notes/routes.js";

test("note input validates fields while preserving markup as plain text", () => {
  const body = "<img src=x onerror=alert(1)>";
  assert.deepEqual(parseNoteInput({
    title: "  Minha nota  ",
    body,
    lessonDate: "2026-03-02",
    status: "complete",
  }), {
    title: "Minha nota",
    body,
    lessonDate: "2026-03-02",
    status: "complete",
  });
  assert.equal(parseNoteInput({
    title: "Nota offline",
    clientId: "d6743b8c-404a-4a46-8fa0-7f4581578f63",
  }).clientId, "d6743b8c-404a-4a46-8fa0-7f4581578f63");
  assert.throws(() => parseNoteInput({ title: " " }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseNoteInput({
    title: "Nota",
    lessonDate: "2026-02-30",
  }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseNoteInput({
    title: "Nota",
    status: "published",
  }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseNoteInput({
    title: "Nota",
    body: null,
  }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseNoteInput({
    title: "Nota",
    clientId: "inválido",
  }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseNoteInput({
    title: "Nota",
    lessonDate: "0000-01-01",
  }), {
    code: "DADOS_INVALIDOS",
  });
});

test("note patch must include a valid field and pagination has a hard cap", () => {
  assert.deepEqual(parseNotePatch({ body: "Atualizado" }), {
    body: "Atualizado",
  });
  assert.deepEqual(parseNotePatch({
    body: "Atualizado",
    baseUpdatedAt: "2026-03-02T12:30:45.123Z",
  }), {
    body: "Atualizado",
    baseUpdatedAt: "2026-03-02T12:30:45.123Z",
  });
  assert.throws(() => parseNotePatch({}), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseNotePatch({
    body: "Atualizado",
    baseUpdatedAt: "não é uma data",
  }), {
    code: "DADOS_INVALIDOS",
  });
  assert.deepEqual(parseNotesPagination("?limit=10&offset=20"), {
    limit: 10,
    offset: 20,
  });
  assert.throws(() => parseNotesPagination("?limit=500"), {
    code: "PAGINACAO_INVALIDA",
  });
});

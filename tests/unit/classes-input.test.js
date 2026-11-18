import assert from "node:assert/strict";
import test from "node:test";
import {
  parseClassInput,
  parseInviteCode,
  parsePagination,
} from "../../src/server/modules/classes/routes.js";

test("class creation input validates and normalizes optional professor", () => {
  assert.deepEqual(parseClassInput({
    name: "  Anatomia  ",
    professorName: "  Professora Fictícia  ",
  }), {
    name: "Anatomia",
    professorName: "Professora Fictícia",
  });
  assert.throws(() => parseClassInput({ name: " " }), {
    code: "DADOS_INVALIDOS",
  });
  assert.throws(() => parseClassInput({
    name: "Classe",
    professorName: "x".repeat(121),
  }), {
    code: "DADOS_INVALIDOS",
  });
});

test("invite codes and pagination enforce fixed bounds", () => {
  assert.equal(parseInviteCode("A".repeat(43)), "A".repeat(43));
  assert.throws(() => parseInviteCode("../../.env"), {
    code: "CONVITE_INVALIDO",
  });
  assert.deepEqual(parsePagination("?limit=10&offset=20"), {
    limit: 10,
    offset: 20,
  });
  assert.throws(() => parsePagination("?limit=500"), {
    code: "PAGINACAO_INVALIDA",
  });
});

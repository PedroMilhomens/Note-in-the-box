import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  isStrongPassword,
  verifyPassword,
} from "../../src/server/modules/auth/password.js";

test("política rejeita senhas curtas e óbvias", () => {
  assert.equal(isStrongPassword("short"), false);
  assert.equal(isStrongPassword("password123"), false);
  assert.equal(isStrongPassword("senha123"), false);
  assert.equal(isStrongPassword("a".repeat(12)), false);
  assert.equal(isStrongPassword("uma-frase-forte-2031"), true);
});

test("scrypt gera hashes salgados e verifica apenas a senha correta", async () => {
  const firstHash = await hashPassword("uma-frase-forte-2031");
  const secondHash = await hashPassword("uma-frase-forte-2031");

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword("uma-frase-forte-2031", firstHash), true);
  assert.equal(await verifyPassword("senha-errada-2031", firstHash), false);
  assert.equal(await verifyPassword("qualquer-senha-2031", "hash-inválido"), false);
});

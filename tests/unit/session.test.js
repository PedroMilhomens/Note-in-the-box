import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookie,
  readSessionToken,
  sessionCookie,
} from "../../src/server/modules/auth/session.js";

test("session cookie usa atributos seguros e rejeita tokens ambíguos", () => {
  const token = "A".repeat(43);
  const cookie = sessionCookie(token, "production");

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.equal(readSessionToken(`other=x; note_session=${token}`), token);
  assert.equal(
    readSessionToken(`note_session=${token}; note_session=${token}`),
    null,
  );
  assert.match(clearSessionCookie("production"), /Max-Age=0/);
});

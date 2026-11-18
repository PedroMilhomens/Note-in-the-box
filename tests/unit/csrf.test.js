import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSameOrigin,
  isStateChangingMethod,
} from "../../src/server/middleware/csrf.js";

test("CSRF aceita origem igual e rejeita diferente ou ausente", () => {
  assert.doesNotThrow(() => assertSameOrigin({
    headers: { origin: "https://app.example.test" },
    socket: {},
  }, "https://app.example.test"));

  assert.throws(
    () => assertSameOrigin({
      headers: { origin: "https://attacker.example.test" },
      socket: {},
    }, "https://app.example.test"),
    { status: 403, code: "ORIGEM_INVALIDA" },
  );
  assert.throws(
    () => assertSameOrigin({ headers: {}, socket: {} }, "https://app.example.test"),
    { status: 403, code: "ORIGEM_INVALIDA" },
  );
  assert.equal(isStateChangingMethod("post"), true);
  assert.equal(isStateChangingMethod("GET"), false);
});

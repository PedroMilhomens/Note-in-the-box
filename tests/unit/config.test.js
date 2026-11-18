import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../src/server/config.js";

test("loadConfig usa valores padrão seguros", () => {
  const config = loadConfig({});

  assert.deepEqual(config, {
    nodeEnv: "development",
    host: "127.0.0.1",
    port: 3000,
    databaseUrl: null,
    databaseUrlTest: null,
  });
});

test("loadConfig rejeita PORT inválida", () => {
  assert.throws(
    () => loadConfig({ PORT: "não-numérico" }),
    /PORT inválido/,
  );
});

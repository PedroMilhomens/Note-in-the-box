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
    appOrigin: null,
    termsVersion: "terms-v1",
    privacyVersion: "privacy-v1",
    legalDocumentsApproved: false,
  });
});

test("loadConfig rejeita PORT inválida", () => {
  assert.throws(
    () => loadConfig({ PORT: "não-numérico" }),
    /PORT inválido/,
  );
});

test("configuração de produção exige origem HTTPS", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production" }),
    /APP_ORIGIN/,
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "http://example.test",
    }),
    /APP_ORIGIN/,
  );
});

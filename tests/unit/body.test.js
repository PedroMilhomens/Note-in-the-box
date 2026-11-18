import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { readBody } from "../../src/server/http/body.js";

test("leitor de corpo termina com erro quando o timeout vence", async () => {
  const request = new PassThrough();

  await assert.rejects(
    readBody(request, { timeoutMs: 10 }),
    {
      status: 408,
      code: "TEMPO_ESGOTADO",
    },
  );
});

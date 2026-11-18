import assert from "node:assert/strict";
import test from "node:test";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";

test("rate limit aplica limites independentes por IP e conta", () => {
  const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });

  limiter.consume("ip-1", "account-1");
  limiter.consume("ip-2", "account-1");
  assert.throws(
    () => limiter.consume("ip-3", "account-1"),
    { status: 429, code: "MUITAS_TENTATIVAS" },
  );
  limiter.consume("ip-1", "account-2");
  assert.throws(
    () => limiter.consume("ip-1", "account-3"),
    { status: 429, code: "MUITAS_TENTATIVAS" },
  );
});

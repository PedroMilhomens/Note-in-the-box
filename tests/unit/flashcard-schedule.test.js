import assert from "node:assert/strict";
import test from "node:test";
import { calculateNextDueAt } from "../../src/server/modules/flashcards/schedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;

test("first review schedules each rating with a distinct initial interval", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const intervals = {
    errei: 10 * 60 * 1000,
    dificil: DAY_MS,
    bom: 2 * DAY_MS,
    facil: 4 * DAY_MS,
  };

  for (const [rating, interval] of Object.entries(intervals)) {
    assert.equal(
      calculateNextDueAt(rating, null, now).getTime(),
      now.getTime() + interval,
    );
  }
});

test("successful ratings grow the prior interval and errei resets it", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const previous = {
    reviewedAt: now,
    nextDueAt: new Date(now.getTime() + 10 * 60 * 1000),
  };

  assert.equal(
    calculateNextDueAt("dificil", previous, now).getTime(),
    now.getTime() + DAY_MS,
  );
  assert.equal(
    calculateNextDueAt("bom", previous, now).getTime(),
    now.getTime() + 2 * DAY_MS,
  );
  assert.equal(
    calculateNextDueAt("facil", previous, now).getTime(),
    now.getTime() + 4 * DAY_MS,
  );

  const tenDayInterval = {
    reviewedAt: now,
    nextDueAt: new Date(now.getTime() + 10 * DAY_MS),
  };
  assert.equal(
    calculateNextDueAt("dificil", tenDayInterval, now).getTime(),
    now.getTime() + 12 * DAY_MS,
  );
  assert.equal(
    calculateNextDueAt("bom", tenDayInterval, now).getTime(),
    now.getTime() + 20 * DAY_MS,
  );
  assert.equal(
    calculateNextDueAt("facil", tenDayInterval, now).getTime(),
    now.getTime() + 30 * DAY_MS,
  );
  assert.equal(
    calculateNextDueAt("errei", tenDayInterval, now).getTime(),
    now.getTime() + 10 * 60 * 1000,
  );
  assert.throws(() => calculateNextDueAt("talvez", null, now), {
    code: "ERR_INVALID_RATING",
  });
});

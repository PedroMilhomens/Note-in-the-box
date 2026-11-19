import assert from "node:assert/strict";
import test from "node:test";
import { getNextPomodoroMode } from "../../public/js/pomodoro-state.js";
import { parsePomodoroInput } from "../../src/server/modules/pomodoro/routes.js";

const now = new Date("2026-01-01T12:00:00.000Z");
const validInput = {
  kind: "foco",
  startedAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
  durationS: 25 * 60,
  completed: true,
  classId: null,
};

test("Pomodoro alternates focus and breaks with a long break every four focus cycles", () => {
  assert.equal(getNextPomodoroMode("foco", 1), "pausa");
  assert.equal(getNextPomodoroMode("foco", 3), "pausa");
  assert.equal(getNextPomodoroMode("foco", 4), "longa");
  assert.equal(getNextPomodoroMode("foco", 5), "pausa");
  assert.equal(getNextPomodoroMode("pausa", 1), "foco");
  assert.equal(getNextPomodoroMode("longa", 4), "foco");
  assert.throws(() => getNextPomodoroMode("descanso", 1), {
    code: "ERR_INVALID_POMODORO_MODE",
  });
});

test("Pomodoro input accepts configured durations only after their elapsed time", () => {
  const parsed = parsePomodoroInput(validInput, now);
  assert.equal(parsed.kind, "foco");
  assert.equal(parsed.startedAt.toISOString(), validInput.startedAt);
  assert.equal(parsed.durationS, 25 * 60);
  assert.equal(parsed.completed, true);
  assert.equal(parsed.classId, null);

  assert.throws(() => parsePomodoroInput({
    ...validInput,
    startedAt: new Date(now.getTime() + 60_000).toISOString(),
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    startedAt: new Date(now.getTime() - 10_000).toISOString(),
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    durationS: 30,
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    durationS: 120 * 60 + 1,
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    kind: "descanso",
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    startedAt: "ontem",
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    completed: false,
  }, now), { code: "DADOS_INVALIDOS" });
  assert.throws(() => parsePomodoroInput({
    ...validInput,
    unexpected: true,
  }, now), { code: "DADOS_INVALIDOS" });
});

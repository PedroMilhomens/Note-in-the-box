const POMODORO_MODES = new Set(["foco", "pausa", "longa"]);

export function getNextPomodoroMode(completedMode, focusCyclesCompleted) {
  if (!POMODORO_MODES.has(completedMode)) {
    const error = new TypeError("modo Pomodoro inválido");
    error.code = "ERR_INVALID_POMODORO_MODE";
    throw error;
  }
  if (!Number.isSafeInteger(focusCyclesCompleted) || focusCyclesCompleted < 0) {
    throw new TypeError("contagem de ciclos inválida");
  }
  if (completedMode !== "foco") return "foco";
  return focusCyclesCompleted > 0 && focusCyclesCompleted % 4 === 0
    ? "longa"
    : "pausa";
}

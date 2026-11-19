import { getNextPomodoroMode } from "./pomodoro-state.js";

const DEFAULT_DURATIONS = {
  foco: 25,
  pausa: 5,
  longa: 15,
};
const MODE_LABELS = {
  foco: "Foco",
  pausa: "Pausa curta",
  longa: "Pausa longa",
};

const classSelect = document.querySelector("#class-select");
const flashcardsLink = document.querySelector("#flashcards-link");
const forumLink = document.querySelector("#forum-link");
const feedback = document.querySelector("#feedback");
const capabilityStatus = document.querySelector("#capability-status");
const timerDisplay = document.querySelector("#timer-display");
const modeLabel = document.querySelector("#mode-label");
const cycleProgress = document.querySelector("#cycle-progress");
const visibilityWarning = document.querySelector("#visibility-warning");
const startButton = document.querySelector("#start-timer");
const pauseButton = document.querySelector("#pause-timer");
const resetButton = document.querySelector("#reset-timer");
const settingsForm = document.querySelector("#settings-form");
const settingsFields = document.querySelector("#settings-fields");
const focusMinutesInput = document.querySelector("#focus-minutes");
const breakMinutesInput = document.querySelector("#break-minutes");
const longBreakMinutesInput = document.querySelector("#long-break-minutes");

let durations = { ...DEFAULT_DURATIONS };
let currentMode = "foco";
let focusCyclesCompleted = 0;
let remainingMs = durations[currentMode] * 60 * 1000;
let deadlineAt = null;
let startedAt = null;
let isRunning = false;
let isFinishing = false;
let leftTabDuringFocus = false;
let fallbackIntervalId = null;
let wakeLockSentinel = null;
let worker = null;
const capabilityMessages = new Map();

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function showCapability(key, message) {
  if (message) capabilityMessages.set(key, message);
  else capabilityMessages.delete(key);
  capabilityStatus.textContent = [...capabilityMessages.values()].join(" ");
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new Error(payload?.erro ?? "Não foi possível concluir a solicitação.");
  }
  if (!payload) throw new Error("Resposta inválida do servidor.");
  return payload;
}

function readDurations() {
  const values = {
    foco: focusMinutesInput.valueAsNumber,
    pausa: breakMinutesInput.valueAsNumber,
    longa: longBreakMinutesInput.valueAsNumber,
  };
  if (
    Object.values(values).some((value) => (
      !Number.isSafeInteger(value) || value < 1 || value > 120
    ))
  ) {
    showFeedback("Informe durações inteiras entre 1 e 120 minutos.", true);
    return null;
  }
  return values;
}

function durationSeconds(mode) {
  return durations[mode] * 60;
}

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateDisplay() {
  timerDisplay.textContent = formatTime(remainingMs);
  modeLabel.textContent = MODE_LABELS[currentMode];
  cycleProgress.textContent = `Ciclos de foco: ${focusCyclesCompleted % 4} de 4`;
  startButton.textContent = startedAt ? "Retomar" : "Iniciar";
  startButton.disabled = isRunning || isFinishing;
  pauseButton.disabled = !isRunning;
  resetButton.disabled = isFinishing;
  settingsFields.disabled = isRunning || isFinishing || startedAt !== null;
}

function stopClock() {
  if (worker) worker.postMessage({ type: "stop" });
  if (fallbackIntervalId !== null) {
    clearInterval(fallbackIntervalId);
    fallbackIntervalId = null;
  }
}

function onTick(newRemainingMs) {
  if (!isRunning) return;
  remainingMs = Math.max(0, newRemainingMs);
  updateDisplay();
  if (remainingMs === 0) void finishCycle();
}

function startFallbackClock() {
  if (fallbackIntervalId !== null) clearInterval(fallbackIntervalId);
  fallbackIntervalId = setInterval(() => {
    onTick(deadlineAt - Date.now());
  }, 250);
}

function startClock() {
  deadlineAt = Date.now() + remainingMs;
  if (worker) {
    worker.postMessage({ type: "start", deadlineAt });
  } else {
    startFallbackClock();
  }
}

function initializeWorker() {
  if (typeof Worker !== "function") {
    showCapability(
      "worker",
      "Web Worker indisponível; o timer usa uma alternativa que recalcula o tempo restante.",
    );
    return;
  }
  try {
    worker = new Worker(new URL("./pomodoro-worker.js", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event) => {
      if (event.data?.type === "tick") onTick(event.data.remainingMs);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      worker?.terminate();
      worker = null;
      showCapability(
        "worker",
        "Web Worker indisponível; o timer continua com uma alternativa de contagem.",
      );
      if (isRunning) startFallbackClock();
    });
  } catch {
    worker = null;
    showCapability(
      "worker",
      "Web Worker indisponível; o timer usa uma alternativa que recalcula o tempo restante.",
    );
  }
}

async function requestNotificationPermissionFromActivation() {
  if (!("Notification" in window)) {
    showCapability("notifications", "Este navegador não oferece notificações.");
    return;
  }
  if (Notification.permission !== "default") return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showCapability("notifications", "Notificações não foram autorizadas.");
    } else {
      showCapability("notifications", null);
    }
  } catch {
    showCapability("notifications", "Não foi possível solicitar notificações.");
  }
}

function sendCompletionNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("Ciclo concluído", {
      body: "Seu ciclo de estudo terminou.",
      tag: "pomodoro-cycle-complete",
    });
  } catch {
    showCapability("notifications", "Não foi possível exibir a notificação.");
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    showCapability("wakeLock", "Este navegador não oferece bloqueio de tela.");
    return;
  }
  if (wakeLockSentinel || !isRunning || currentMode !== "foco") return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
    showCapability("wakeLock", null);
  } catch {
    showCapability("wakeLock", "Não foi possível manter a tela ligada.");
  }
}

async function releaseWakeLock() {
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    showCapability("wakeLock", "Não foi possível liberar o bloqueio de tela.");
  }
}

async function finishCycle() {
  if (!isRunning || isFinishing) return;
  isRunning = false;
  isFinishing = true;
  stopClock();
  remainingMs = 0;
  updateDisplay();
  await releaseWakeLock();

  const completedMode = currentMode;
  const session = {
    kind: completedMode,
    startedAt: startedAt.toISOString(),
    durationS: durationSeconds(completedMode),
    completed: true,
    classId: classSelect.value || null,
  };

  if (completedMode === "foco") focusCyclesCompleted += 1;
  currentMode = getNextPomodoroMode(completedMode, focusCyclesCompleted);
  remainingMs = durationSeconds(currentMode) * 1000;
  startedAt = null;
  if (!leftTabDuringFocus) visibilityWarning.hidden = true;
  try {
    await request("/api/pomodoro/sessions", {
      method: "POST",
      body: JSON.stringify(session),
    });
    showFeedback("Ciclo concluído e registrado.");
  } catch (error) {
    showFeedback(`Ciclo concluído, mas não foi registrado: ${error.message}`, true);
  }
  sendCompletionNotification();
  isFinishing = false;
  updateDisplay();
  if (currentMode === "foco") void requestWakeLock();
}

function startTimer() {
  if (isRunning || isFinishing) return;
  const newDurations = readDurations();
  if (!newDurations) return;
  durations = newDurations;
  if (startedAt === null) {
    startedAt = new Date();
    remainingMs = durationSeconds(currentMode) * 1000;
  }
  isRunning = true;
  leftTabDuringFocus = false;
  visibilityWarning.hidden = true;
  void requestNotificationPermissionFromActivation();
  startClock();
  if (currentMode === "foco") void requestWakeLock();
  showFeedback("Timer iniciado.");
  updateDisplay();
}

function pauseTimer() {
  if (!isRunning) return;
  remainingMs = Math.max(0, deadlineAt - Date.now());
  isRunning = false;
  stopClock();
  void releaseWakeLock();
  showFeedback("Timer pausado. O ciclo ainda não foi registrado.");
  updateDisplay();
}

function resetTimer() {
  if (isFinishing) return;
  const newDurations = readDurations();
  if (!newDurations) return;
  durations = newDurations;
  const wasStarted = startedAt !== null || isRunning;
  isRunning = false;
  startedAt = null;
  stopClock();
  void releaseWakeLock();
  remainingMs = durationSeconds(currentMode) * 1000;
  visibilityWarning.hidden = true;
  showFeedback(wasStarted
    ? "Ciclo reiniciado; nenhum ciclo foi registrado."
    : "Timer reiniciado.");
  updateDisplay();
}

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isRunning || startedAt !== null) return;
  const newDurations = readDurations();
  if (!newDurations) return;
  durations = newDurations;
  remainingMs = durationSeconds(currentMode) * 1000;
  showFeedback("Durações atualizadas.");
  updateDisplay();
});

startButton.addEventListener("click", startTimer);
pauseButton.addEventListener("click", pauseTimer);
resetButton.addEventListener("click", resetTimer);

document.addEventListener("visibilitychange", () => {
  if (
    document.hidden
    && isRunning
    && currentMode === "foco"
  ) {
    leftTabDuringFocus = true;
    visibilityWarning.textContent = "Você saiu da aba durante o foco; o timer continua contando.";
    visibilityWarning.hidden = false;
    return;
  }
  if (!document.hidden && leftTabDuringFocus) {
    visibilityWarning.textContent = isRunning && currentMode === "foco"
      ? "Você voltou à aba; o timer continuou contando."
      : "Você saiu da aba durante o foco; o ciclo continuou em segundo plano.";
    visibilityWarning.hidden = false;
    leftTabDuringFocus = false;
  }
  if (!document.hidden && isRunning && currentMode === "foco") {
    void requestWakeLock();
    onTick(deadlineAt - Date.now());
  }
});

function updateClassLinks() {
  const classId = classSelect.value;
  for (const link of [flashcardsLink, forumLink]) {
    const address = new URL(link.href);
    if (classId) address.searchParams.set("classId", classId);
    else address.searchParams.delete("classId");
    link.href = address.href;
  }
}

classSelect.addEventListener("change", () => {
  updateClassLinks();
  showFeedback("A classe selecionada será associada aos próximos ciclos.");
});

async function loadClasses() {
  const result = await request("/api/classes?limit=100");
  classSelect.replaceChildren();
  const noClass = document.createElement("option");
  noClass.value = "";
  noClass.textContent = "Sem classe";
  classSelect.append(noClass);
  for (const item of result.classes) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    classSelect.append(option);
  }
  const requestedClassId = new URL(window.location.href).searchParams.get("classId");
  if (result.classes.some((item) => item.id === requestedClassId)) {
    classSelect.value = requestedClassId;
  }
  updateClassLinks();
}

initializeWorker();
updateDisplay();
loadClasses().catch((error) => {
  classSelect.disabled = true;
  showFeedback(error.message, true);
});

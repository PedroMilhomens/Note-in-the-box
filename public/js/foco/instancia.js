// Instância única do timer: sobrevive à navegação entre telas (o app é uma SPA).
import { criarTimer } from "./timer.js";

let timer = null;

function criarRelogio() {
  let worker = null;
  let intervalo = null;
  let aoTicAtual = null;
  let prazoAtual = 0;

  function iniciarAlternativa() {
    clearInterval(intervalo);
    intervalo = setInterval(() => aoTicAtual?.(prazoAtual - Date.now()), 250);
  }
  try {
    if (typeof Worker === "function") {
      worker = new Worker(new URL("../pomodoro-worker.js", import.meta.url), { type: "module" });
      worker.addEventListener("message", (evento) => {
        if (evento.data?.type === "tick") aoTicAtual?.(evento.data.remainingMs);
      });
      worker.addEventListener("error", (evento) => {
        evento.preventDefault();
        worker?.terminate();
        worker = null;
        if (aoTicAtual) iniciarAlternativa();
      });
    }
  } catch { worker = null; }

  return {
    iniciar(prazo, aoTic) {
      prazoAtual = prazo;
      aoTicAtual = aoTic;
      if (worker) worker.postMessage({ type: "start", deadlineAt: prazo });
      else iniciarAlternativa();
    },
    parar() {
      aoTicAtual = null;
      worker?.postMessage({ type: "stop" });
      clearInterval(intervalo);
      intervalo = null;
    },
  };
}

export function obterTimer(api) {
  if (timer) return timer;
  const relogio = criarRelogio();
  let sentinela = null;

  const travarTela = async () => {
    if (sentinela || !("wakeLock" in navigator)) return;
    try {
      sentinela = await navigator.wakeLock.request("screen");
      sentinela.addEventListener("release", () => { sentinela = null; });
    } catch { sentinela = null; }
  };
  const liberarTela = async () => {
    const atual = sentinela;
    sentinela = null;
    try { await atual?.release(); } catch { /* sem bloqueio para liberar */ }
  };

  timer = criarTimer({
    agora: () => Date.now(),
    iniciarRelogio: (prazo, aoTic) => relogio.iniciar(prazo, aoTic),
    pararRelogio: () => relogio.parar(),
    registrar: (sessao) => api.post("/api/pomodoro/sessions", sessao),
    travarTela,
    liberarTela,
    pedirNotificacao: () => {
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission().catch(() => {});
      }
    },
    notificar: () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try { new Notification("Ciclo concluído", { body: "Seu ciclo de estudo terminou.", tag: "pomodoro-cycle-complete" }); } catch { /* sem notificação */ }
    },
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    timer.sincronizar();
    if (timer.estado().rodando && timer.estado().modo === "foco") void travarTela();
  });
  return timer;
}

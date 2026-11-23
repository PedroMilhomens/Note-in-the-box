// Núcleo do Pomodoro: máquina de estados sem DOM, com dependências injetadas (testável).
import { getNextPomodoroMode } from "../pomodoro-state.js";

export const DURACOES_PADRAO = { foco: 25, pausa: 5, longa: 15 };
export const ROTULO_MODO = { foco: "Foco", pausa: "Pausa curta", longa: "Pausa longa" };

export function duracoesValidas(duracoes) {
  return ["foco", "pausa", "longa"].every((modo) => (
    Number.isSafeInteger(duracoes?.[modo]) && duracoes[modo] >= 1 && duracoes[modo] <= 120));
}

// dep: { agora(), iniciarRelogio(prazo, aoTic), pararRelogio(), registrar(sessao),
//        travarTela?(), liberarTela?(), pedirNotificacao?(), notificar?() }
export function criarTimer(dep) {
  const e = {
    modo: "foco",
    duracoes: { ...DURACOES_PADRAO },
    restanteMs: DURACOES_PADRAO.foco * 60_000,
    rodando: false,
    iniciadoEm: null,
    ciclos: 0,
    finalizando: false,
    classId: null,
    aviso: "",
    erro: false,
  };
  const ouvintes = new Set();
  let prazo = null;

  const estado = () => ({ ...e, duracoes: { ...e.duracoes }, iniciado: e.iniciadoEm !== null });
  const emitir = () => { for (const ouvinte of [...ouvintes]) ouvinte(estado()); };
  const cheio = () => e.duracoes[e.modo] * 60_000;

  function aoTic(restante) {
    if (!e.rodando) return;
    e.restanteMs = Math.max(0, restante);
    emitir();
    if (e.restanteMs === 0) void concluir();
  }

  function iniciar() {
    if (e.rodando || e.finalizando) return;
    if (e.iniciadoEm === null) {
      e.iniciadoEm = new Date(dep.agora());
      e.restanteMs = cheio();
    }
    e.rodando = true;
    e.aviso = "";
    prazo = dep.agora() + e.restanteMs;
    dep.iniciarRelogio(prazo, aoTic);
    if (e.modo === "foco") dep.travarTela?.();
    dep.pedirNotificacao?.();
    emitir();
  }

  function pausar() {
    if (!e.rodando) return;
    e.restanteMs = Math.max(0, prazo - dep.agora());
    e.rodando = false;
    dep.pararRelogio();
    dep.liberarTela?.();
    e.aviso = "Pausado. O ciclo só é registrado quando termina.";
    e.erro = false;
    emitir();
  }

  function reiniciar() {
    if (e.finalizando) return;
    const tinhaCiclo = e.iniciadoEm !== null;
    e.rodando = false;
    e.iniciadoEm = null;
    dep.pararRelogio();
    dep.liberarTela?.();
    e.restanteMs = cheio();
    e.aviso = tinhaCiclo ? "Ciclo reiniciado; nada foi registrado." : "";
    e.erro = false;
    emitir();
  }

  function escolherModo(modo) {
    if (e.rodando || e.iniciadoEm !== null || e.finalizando || !(modo in DURACOES_PADRAO)) return false;
    e.modo = modo;
    e.restanteMs = cheio();
    emitir();
    return true;
  }

  function definirDuracoes(duracoes) {
    if (e.rodando || e.iniciadoEm !== null || e.finalizando) return false;
    if (!duracoesValidas(duracoes)) return false;
    e.duracoes = { foco: duracoes.foco, pausa: duracoes.pausa, longa: duracoes.longa };
    e.restanteMs = cheio();
    emitir();
    return true;
  }

  function definirClasse(classId) {
    e.classId = classId || null;
    emitir();
  }

  async function concluir() {
    if (!e.rodando || e.finalizando) return;
    e.rodando = false;
    e.finalizando = true;
    dep.pararRelogio();
    e.restanteMs = 0;
    emitir();
    dep.liberarTela?.();

    const concluido = e.modo;
    const sessao = {
      kind: concluido,
      startedAt: e.iniciadoEm.toISOString(),
      durationS: e.duracoes[concluido] * 60,
      completed: true,
      classId: e.classId,
    };
    if (concluido === "foco") e.ciclos += 1;
    e.modo = getNextPomodoroMode(concluido, e.ciclos);
    e.restanteMs = cheio();
    e.iniciadoEm = null;
    try {
      await dep.registrar(sessao);
      e.aviso = "Ciclo concluído e registrado.";
      e.erro = false;
    } catch (falha) {
      e.aviso = `Ciclo concluído, mas não foi registrado: ${falha?.message ?? "erro desconhecido"}`;
      e.erro = true;
    }
    dep.notificar?.();
    e.finalizando = false;
    emitir();
  }

  // Chamado ao voltar para a aba: recalcula o restante pelo relógio, não pelos ticks.
  function sincronizar() {
    if (e.rodando) aoTic(prazo - dep.agora());
  }

  return {
    estado,
    iniciar, pausar, reiniciar, escolherModo, definirDuracoes, definirClasse, sincronizar,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

export function formatarTempo(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

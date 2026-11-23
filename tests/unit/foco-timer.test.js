import assert from "node:assert/strict";
import test from "node:test";
import { criarTimer, duracoesValidas, formatarTempo } from "../../public/js/foco/timer.js";

function ambiente() {
  const r = { agora: Date.parse("2026-11-23T10:00:00.000Z"), sessoes: [], tela: 0, liberada: 0, notificou: 0, parou: 0, aoTic: null, prazo: null, falhar: false };
  const dep = {
    agora: () => r.agora,
    iniciarRelogio: (prazo, aoTic) => { r.prazo = prazo; r.aoTic = aoTic; },
    pararRelogio: () => { r.parou += 1; },
    registrar: async (sessao) => { if (r.falhar) throw new Error("sem rede"); r.sessoes.push(sessao); },
    travarTela: () => { r.tela += 1; },
    liberarTela: () => { r.liberada += 1; },
    notificar: () => { r.notificou += 1; },
  };
  return { r, timer: criarTimer(dep) };
}
const avancar = (r, ms) => { r.agora += ms; r.aoTic(r.prazo - r.agora); };

test("começa em foco de 25 minutos, parado", () => {
  const { timer } = ambiente();
  const e = timer.estado();
  assert.deepEqual([e.modo, e.restanteMs, e.rodando, e.iniciado], ["foco", 1_500_000, false, false]);
});

test("iniciar trava a tela só no foco e pausar guarda o restante pelo relógio", () => {
  const { r, timer } = ambiente();
  timer.iniciar();
  assert.equal(r.tela, 1);
  r.agora += 60_000;
  timer.pausar();
  assert.equal(timer.estado().restanteMs, 1_440_000);
  assert.equal(timer.estado().rodando, false);
  timer.iniciar();
  assert.equal(r.prazo, r.agora + 1_440_000);
});

test("ciclo de foco concluído registra a sessão e passa para a pausa curta", async () => {
  const { r, timer } = ambiente();
  timer.definirClasse("6f1c1d0e-0000-4000-8000-000000000001");
  timer.iniciar();
  avancar(r, 1_500_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.sessoes.length, 1);
  assert.deepEqual(
    [r.sessoes[0].kind, r.sessoes[0].durationS, r.sessoes[0].completed, r.sessoes[0].startedAt, r.sessoes[0].classId],
    ["foco", 1500, true, "2026-11-23T10:00:00.000Z", "6f1c1d0e-0000-4000-8000-000000000001"],
  );
  const e = timer.estado();
  assert.deepEqual([e.modo, e.restanteMs, e.ciclos, e.iniciado, e.rodando], ["pausa", 300_000, 1, false, false]);
  assert.equal(r.notificou, 1);
  assert.equal(e.aviso, "Ciclo concluído e registrado.");
});

test("depois de quatro focos vem a pausa longa", async () => {
  const { r, timer } = ambiente();
  for (let i = 0; i < 4; i += 1) {
    timer.iniciar();
    avancar(r, timer.estado().restanteMs);
    await new Promise((resolve) => setImmediate(resolve));
    if (i < 3) { assert.equal(timer.estado().modo, "pausa"); timer.iniciar(); avancar(r, 300_000); await new Promise((resolve) => setImmediate(resolve)); }
  }
  assert.equal(timer.estado().modo, "longa");
});

test("falha ao registrar não perde o ciclo e avisa o erro", async () => {
  const { r, timer } = ambiente();
  r.falhar = true;
  timer.iniciar();
  avancar(r, 1_500_000);
  await new Promise((resolve) => setImmediate(resolve));
  const e = timer.estado();
  assert.equal(e.erro, true);
  assert.match(e.aviso, /não foi registrado: sem rede/);
  assert.equal(e.ciclos, 1);
  assert.equal(e.finalizando, false);
});

test("reiniciar não registra nada; modo e durações só mudam com o timer zerado", () => {
  const { r, timer } = ambiente();
  timer.iniciar();
  assert.equal(timer.escolherModo("pausa"), false);
  assert.equal(timer.definirDuracoes({ foco: 30, pausa: 5, longa: 15 }), false);
  timer.reiniciar();
  assert.equal(r.sessoes.length, 0);
  assert.match(timer.estado().aviso, /nada foi registrado/);
  assert.equal(timer.escolherModo("longa"), true);
  assert.equal(timer.estado().restanteMs, 900_000);
  assert.equal(timer.definirDuracoes({ foco: 30, pausa: 5, longa: 20 }), true);
  assert.equal(timer.estado().restanteMs, 1_200_000);
});

test("sincronizar recalcula pelo relógio ao voltar à aba", async () => {
  const { r, timer } = ambiente();
  timer.iniciar();
  r.agora += 600_000;
  timer.sincronizar();
  assert.equal(timer.estado().restanteMs, 900_000);
  r.agora += 900_000;
  timer.sincronizar();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.sessoes.length, 1);
});

test("assinantes recebem o estado e podem sair", () => {
  const { timer } = ambiente();
  const vistos = [];
  const sair = timer.assinar((e) => vistos.push(e.rodando));
  timer.iniciar();
  sair();
  timer.pausar();
  assert.deepEqual(vistos, [true]);
});

test("validação de durações e formatação do tempo", () => {
  assert.equal(duracoesValidas({ foco: 1, pausa: 120, longa: 15 }), true);
  assert.equal(duracoesValidas({ foco: 0, pausa: 5, longa: 15 }), false);
  assert.equal(duracoesValidas({ foco: 25, pausa: 5.5, longa: 15 }), false);
  assert.equal(duracoesValidas({ foco: 25, pausa: 5, longa: 121 }), false);
  assert.equal(formatarTempo(1_500_000), "25:00");
  assert.equal(formatarTempo(61_001), "01:02");
  assert.equal(formatarTempo(-5), "00:00");
});

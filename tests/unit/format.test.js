import assert from "node:assert/strict";
import test from "node:test";
import { dataCurta, listaDeNomes, plural, tempoRelativo } from "../../public/js/format.js";

test("plural usa singular apenas para 1", () => {
  assert.equal(plural(0, "nota", "notas"), "0 notas");
  assert.equal(plural(1, "nota", "notas"), "1 nota");
  assert.equal(plural(2, "nota", "notas"), "2 notas");
});

test("dataCurta converte AAAA-MM-DD e ignora entradas inválidas", () => {
  assert.equal(dataCurta("2026-11-07"), "07/11");
  for (const ruim of ["07/11/2026", "2026-11-07T10:00:00Z", "", null, undefined, "<b>x</b>"]) {
    assert.equal(dataCurta(ruim), "");
  }
});

test("tempoRelativo cobre minutos, horas, dias e entradas inválidas", () => {
  const agora = Date.parse("2026-11-20T12:00:00Z");
  const antes = (ms) => new Date(agora - ms).toISOString();
  assert.equal(tempoRelativo(antes(10_000), agora), "agora");
  assert.equal(tempoRelativo(antes(5 * 60_000), agora), "há 5 min");
  assert.equal(tempoRelativo(antes(2 * 3_600_000), agora), "há 2 h");
  assert.equal(tempoRelativo(antes(30 * 3_600_000), agora), "ontem");
  assert.equal(tempoRelativo(antes(3 * 86_400_000), agora), "há 3 dias");
  assert.equal(tempoRelativo(antes(90 * 86_400_000), agora), "há mais de um mês");
  assert.equal(tempoRelativo(antes(-60_000), agora), "agora", "relógio adiantado não gera tempo negativo");
  assert.equal(tempoRelativo(null, agora), "");
  assert.equal(tempoRelativo("lixo", agora), "");
});

test("listaDeNomes junta com vírgula e 'e'", () => {
  assert.equal(listaDeNomes([]), "");
  assert.equal(listaDeNomes(["Ana"]), "Ana");
  assert.equal(listaDeNomes(["Ana", "Bruno"]), "Ana e Bruno");
  assert.equal(listaDeNomes(["Ana", "Bruno", "Carla"]), "Ana, Bruno e Carla");
});

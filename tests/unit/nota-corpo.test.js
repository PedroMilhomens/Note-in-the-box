import assert from "node:assert/strict";
import test from "node:test";
import { aplicarMarcacao, parseCorpo, parseInline } from "../../public/js/nota/corpo.js";

test("parseInline reconhece negrito, itálico e referências", () => {
  assert.deepEqual(parseInline("a **b** _c_ [[Aula 05]] d"), [
    { tipo: "texto", valor: "a " },
    { tipo: "negrito", valor: "b" },
    { tipo: "texto", valor: " " },
    { tipo: "italico", valor: "c" },
    { tipo: "texto", valor: " " },
    { tipo: "ref", valor: "Aula 05" },
    { tipo: "texto", valor: " d" },
  ]);
});

test("HTML e scripts continuam sendo texto puro", () => {
  const blocos = parseCorpo('<img src=x onerror=alert(1)> **<b>x</b>** [[<script>]]');
  const partes = blocos[0].partes;
  assert.ok(partes.every((p) => ["texto", "negrito", "ref"].includes(p.tipo)));
  assert.equal(partes[0].valor.startsWith("<img"), true);
  assert.equal(partes.find((p) => p.tipo === "negrito").valor, "<b>x</b>");
});

test("parágrafos e listas são separados por linhas em branco", () => {
  const blocos = parseCorpo("Primeiro\nainda primeiro\n\n- a\n- b\n\nÚltimo");
  assert.deepEqual(blocos.map((b) => b.tipo), ["paragrafo", "lista", "paragrafo"]);
  assert.equal(blocos[1].itens.length, 2);
  assert.equal(blocos[0].partes[0].valor, "Primeiro\nainda primeiro");
});

test("entradas vazias ou estranhas não quebram", () => {
  assert.deepEqual(parseCorpo(""), []);
  assert.deepEqual(parseCorpo(null), []);
  assert.deepEqual(parseCorpo("\r\n\r\n"), []);
  assert.doesNotThrow(() => parseCorpo("**".repeat(5000)));
  assert.doesNotThrow(() => parseCorpo(`[[${"a".repeat(5000)}`));
});

test("aplicarMarcacao envolve a seleção e mantém o foco no texto", () => {
  const negrito = aplicarMarcacao("olá mundo", 4, 9, "negrito");
  assert.equal(negrito.texto, "olá **mundo**");
  assert.equal("olá **mundo**".slice(negrito.inicio, negrito.fim), "mundo");
  assert.equal(aplicarMarcacao("x", 0, 1, "italico").texto, "_x_");
  assert.equal(aplicarMarcacao("a\nb", 0, 3, "lista").texto, "- a\n- b");
  assert.equal(aplicarMarcacao("- a", 0, 3, "lista").texto, "- a");
});

import assert from "node:assert/strict";
import test from "node:test";
import { compileRoutes, matchRoute, safeNextPath } from "../../public/js/router-client.js";
import { ROTAS } from "../../public/js/routes.js";

const rotas = compileRoutes(ROTAS);

test("casa rotas fixas e com parâmetro, com ou sem barra final", () => {
  assert.equal(matchRoute(rotas, "/entrar").rota.nome, "entrar");
  assert.equal(matchRoute(rotas, "/entrar/").rota.nome, "entrar");
  const classe = matchRoute(rotas, "/classes/abc-123");
  assert.equal(classe.rota.nome, "classe");
  assert.deepEqual(classe.params, { classId: "abc-123" });
});

test("decodifica parâmetros e rejeita separadores codificados", () => {
  assert.deepEqual(matchRoute(rotas, "/classes/a%20b").params, { classId: "a b" });
  assert.equal(matchRoute(rotas, "/classes/a%2Fb"), null);
  assert.equal(matchRoute(rotas, "/classes/a%5Cb"), null);
  assert.equal(matchRoute(rotas, "/classes/%E0%A4%A"), null);
});

test("rotas desconhecidas e caminhos profundos não casam", () => {
  assert.equal(matchRoute(rotas, "/nada"), null);
  assert.equal(matchRoute(rotas, "/classes/a/b"), null);
  assert.equal(matchRoute(rotas, "/notes.html"), null);
});

test("somente entrar e cadastro são públicos e exclusivos de visitantes", () => {
  const publicas = ROTAS.filter((rota) => rota.publica && rota.nome !== "raiz").map((rota) => rota.nome);
  assert.deepEqual(publicas, ["entrar", "cadastro"]);
  for (const rota of ROTAS.filter((item) => item.publica && item.nome !== "raiz")) {
    assert.equal(rota.somenteVisitante, true);
  }
});

test("safeNextPath só aceita caminhos internos", () => {
  assert.equal(safeNextPath("/classes/1"), "/classes/1");
  assert.equal(safeNextPath("/inicio?x=1"), "/inicio?x=1");
  for (const ruim of [
    "//evil.test", "https://evil.test", "/\\evil.test", "javascript:alert(1)",
    "evil", "", null, undefined, 42, "/a\nb", `/${"a".repeat(300)}`,
  ]) {
    assert.equal(safeNextPath(ruim), null, String(ruim));
  }
});

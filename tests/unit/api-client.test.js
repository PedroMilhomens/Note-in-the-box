import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApi, ehErroDeRede } from "../../public/js/api.js";

function resposta(status, corpo, tipo = "application/json; charset=utf-8") {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: tipo ? { "content-type": tipo } : {},
  });
}

test("GET e POST usam mesma origem, JSON e sem corpo indevido", async () => {
  const chamadas = [];
  const api = createApi({
    fetchImpl: async (caminho, init) => {
      chamadas.push([caminho, init]);
      return resposta(200, { ok: true });
    },
  });
  assert.deepEqual(await api.get("/api/me"), { ok: true });
  await api.post("/api/auth/login", { email: "a@b.c" });
  assert.equal(chamadas[0][1].method, "GET");
  assert.equal(chamadas[0][1].body, undefined);
  assert.equal(chamadas[0][1].credentials, "same-origin");
  assert.equal(chamadas[1][1].headers["content-type"], "application/json");
  assert.equal(chamadas[1][1].body, JSON.stringify({ email: "a@b.c" }));
});

test("recusa caminhos fora de /api/ antes de qualquer requisição", async () => {
  let chamou = false;
  const api = createApi({ fetchImpl: async () => { chamou = true; return resposta(200, {}); } });
  for (const caminho of ["https://evil.test/api/x", "//evil.test/api/x", "/outra", "api/me"]) {
    await assert.rejects(api.get(caminho), TypeError, caminho);
  }
  assert.equal(chamou, false);
});

test("erros viram ApiError com código e mensagem do servidor", async () => {
  const api = createApi({
    fetchImpl: async () => resposta(403, { codigo: "PROIBIDO", erro: "sem permissão" }),
  });
  await assert.rejects(api.get("/api/x"), (erro) => (
    erro instanceof ApiError && erro.status === 403 && erro.codigo === "PROIBIDO" && erro.message === "sem permissão"
  ));
});

test("401 aciona onUnauthorized, exceto quando semRedirecionar", async () => {
  let acionou = 0;
  const api = createApi({
    fetchImpl: async () => resposta(401, { codigo: "NAO_AUTENTICADO", erro: "login necessário" }),
    onUnauthorized: () => { acionou += 1; },
  });
  await assert.rejects(api.get("/api/me"));
  assert.equal(acionou, 1);
  await assert.rejects(api.get("/api/me", { semRedirecionar: true }));
  assert.equal(acionou, 1);
});

test("falha de rede vira ApiError status 0 e corpo inválido não vaza detalhes", async () => {
  const semRede = createApi({ fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(semRede.get("/api/me"), (erro) => erro.status === 0 && erro.codigo === "SEM_REDE");

  const invalido = createApi({
    fetchImpl: async () => new Response("<html>stack trace</html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    }),
  });
  await assert.rejects(invalido.get("/api/x"), (erro) => (
    erro.status === 500 && !erro.message.includes("stack")
  ));
});

test("erros HTTP guardam o corpo da resposta (payload) e distinguem falha de rede", async () => {
  const api = createApi({
    fetchImpl: async () => resposta(409, { codigo: "CONFLITO_NOTA", erro: "mudou", note: { id: "n1" } }),
  });
  await assert.rejects(api.patch("/api/x", {}), (erro) => (
    erro.status === 409 && erro.payload.note.id === "n1" && !ehErroDeRede(erro)
  ));
  const semRede = createApi({ fetchImpl: async () => { throw new TypeError("x"); } });
  await assert.rejects(semRede.get("/api/x"), (erro) => ehErroDeRede(erro));
  assert.equal(ehErroDeRede(new TypeError("fetch failed")), true);
  assert.equal(ehErroDeRede(null), false);
});

test("upload envia o arquivo bruto com cabeçalhos próprios e sem JSON", async () => {
  let init;
  const api = createApi({ fetchImpl: async (_c, i) => { init = i; return resposta(201, { ok: true }); } });
  const arquivo = new Blob(["abc"], { type: "application/pdf" });
  await api.upload("/api/classes/c/notes/n/attachments", arquivo, { "content-type": "application/pdf", "x-file-name": "a.pdf" });
  assert.equal(init.body, arquivo);
  assert.equal(init.headers["content-type"], "application/pdf");
  assert.equal(init.headers["x-file-name"], "a.pdf");
  assert.equal(init.method, "POST");
});

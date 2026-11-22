import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");

function harness({ fetchImpl }) {
  const handlers = new Map();
  const guardado = new Map();
  const self = {
    location: { origin: "https://app.test" },
    addEventListener(tipo, handler) { handlers.set(tipo, handler); },
  };
  const caches = {
    async open() {
      return {
        async match(requisicao) { return guardado.get(requisicao.url); },
        async put(requisicao, resposta) { guardado.set(requisicao.url, resposta); },
      };
    },
  };
  vm.runInNewContext(source, { URL, Request, Promise, Set, caches, self, fetch: fetchImpl });
  return { handlers, guardado };
}

function pedir(handlers, url) {
  let resposta;
  handlers.get("fetch")({
    request: new Request(url),
    respondWith(promessa) { resposta = promessa; },
  });
  return resposta;
}

test("com rede, o service worker entrega a versão nova e atualiza a cópia", async () => {
  const nova = { ok: true, type: "basic", marca: "nova", clone() { return { marca: "copia-nova" }; } };
  const { handlers, guardado } = harness({ fetchImpl: async () => nova });
  guardado.set("https://app.test/css/tokens.css", { marca: "antiga" });
  const resposta = await pedir(handlers, "https://app.test/css/tokens.css");
  assert.equal(resposta.marca, "nova");
  assert.equal(guardado.get("https://app.test/css/tokens.css").marca, "copia-nova");
});

test("sem rede, entrega a cópia guardada; sem cópia, propaga o erro", async () => {
  const falha = async () => { throw new TypeError("offline"); };
  const { handlers, guardado } = harness({ fetchImpl: falha });
  guardado.set("https://app.test/", { marca: "casca" });
  assert.equal((await pedir(handlers, "https://app.test/")).marca, "casca");
  await assert.rejects(pedir(handlers, "https://app.test/css/base.css"), TypeError);
});

test("rotas do app usam a casca em cache quando offline", async () => {
  const falha = async () => { throw new TypeError("offline"); };
  const { handlers, guardado } = harness({ fetchImpl: falha });
  guardado.set("https://app.test/", { marca: "casca" });
  assert.equal((await pedir(handlers, "https://app.test/classes/abc?x=1")).marca, "casca");
});

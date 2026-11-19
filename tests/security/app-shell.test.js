import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Router } from "../../src/server/router.js";
import { createServer } from "../../src/server/index.js";
import { APP_ROUTE_PREFIXES } from "../../src/server/http/static.js";
import { ROTAS } from "../../public/js/routes.js";

const publicDir = new URL("../../public/", import.meta.url);

async function listen(server, context) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function arquivosJs(dir) {
  const itens = await readdir(dir, { withFileTypes: true });
  const arquivos = [];
  for (const item of itens) {
    const caminho = path.join(dir.pathname ?? dir, item.name);
    if (item.isDirectory()) arquivos.push(...await arquivosJs(caminho));
    else if (item.name.endsWith(".js")) arquivos.push(caminho);
  }
  return arquivos;
}

test("rotas do app devolvem o shell com cabeçalhos de segurança; desconhecidas dão 404", async (context) => {
  const server = createServer({ router: new Router(), appOrigin: null });
  const baseUrl = await listen(server, context);

  for (const rota of ["/", "/entrar", "/cadastro", "/inicio", "/classes", "/classes/abc", "/cartoes", "/foco", "/conta"]) {
    const resposta = await fetch(`${baseUrl}${rota}?next=%2Finicio`);
    assert.equal(resposta.status, 200, rota);
    assert.match(resposta.headers.get("content-type"), /^text\/html/);
    assert.match(await resposta.text(), /data-app-shell/);
    assert.match(resposta.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(resposta.headers.get("x-frame-options"), "DENY");
  }
  for (const rota of ["/desconhecida", "/classesx", "/api/nao-existe", "/.env", "/entrar/../.env"]) {
    const resposta = await fetch(`${baseUrl}${rota}`);
    assert.ok([400, 404].includes(resposta.status), `${rota} => ${resposta.status}`);
  }
  const post = await fetch(`${baseUrl}/entrar`, { method: "POST" });
  assert.equal(post.status, 404, "o shell só responde a GET e HEAD");
});

test("prefixos do servidor, do Service Worker e da tabela de rotas ficam sincronizados", async () => {
  const sw = await readFile(new URL("sw.js", publicDir), "utf8");
  const declarado = sw.match(/const APP_ROUTE_PREFIXES = \[(.*?)\];/s)[1];
  const prefixosSw = [...declarado.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(prefixosSw, APP_ROUTE_PREFIXES);

  const raizes = new Set(ROTAS.map((rota) => `/${rota.path.split("/")[1]}`));
  raizes.delete("/");
  assert.deepEqual([...raizes].sort(), [...APP_ROUTE_PREFIXES].sort());
});

test("todo arquivo de view e de componente existe e está no cache do Service Worker", async () => {
  const sw = await readFile(new URL("sw.js", publicDir), "utf8");
  for (const dir of ["js/views", "js/components"]) {
    for (const arquivo of await arquivosJs(new URL(`${dir}/`, publicDir))) {
      const relativo = `/${path.relative(publicDir.pathname, arquivo)}`;
      assert.ok(sw.includes(`"${relativo}"`), `${relativo} no cache`);
      await access(arquivo);
    }
  }
});

test("código novo do front-end não usa APIs que interpretam HTML ou executam texto", async () => {
  const proibido = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(|localStorage|sessionStorage/;
  const alvos = [
    ...await arquivosJs(new URL("js/views/", publicDir)),
    ...await arquivosJs(new URL("js/components/", publicDir)),
    new URL("js/app.js", publicDir).pathname,
    new URL("js/api.js", publicDir).pathname,
    new URL("js/router-client.js", publicDir).pathname,
    new URL("js/store.js", publicDir).pathname,
  ];
  for (const alvo of alvos) {
    const codigo = await readFile(alvo, "utf8");
    assert.doesNotMatch(codigo, proibido, path.basename(alvo));
  }
});

test("shell não usa scripts ou estilos inline (compatível com o CSP)", async () => {
  const html = await readFile(new URL("index.html", publicDir), "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=/i);
  assert.match(html, /id="app"/);
  assert.match(html, /href="#conteudo"/);
});

import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import { Router } from "../../src/server/router.js";
import { createServer } from "../../src/server/index.js";

const publicUrl = (path) => new URL(`../../public/${path}`, import.meta.url);

async function listen(server, context) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("tokens definem a paleta combinada e fontes locais", async () => {
  const tokens = await readFile(publicUrl("css/tokens.css"), "utf8");
  for (const cor of ["#0f0915", "#281040", "#471a73", "#7e688c", "#f4f4f4"]) {
    assert.ok(tokens.toLowerCase().includes(cor), `paleta ${cor}`);
  }
  assert.doesNotMatch(tokens, /https?:\/\//, "fontes e estilos não vêm de terceiros");
  assert.match(tokens, /--alvo-toque:\s*44px/);
});

test("servidor entrega CSS, fontes e logos com tipo correto e cabeçalhos seguros", async (context) => {
  const server = createServer({ router: new Router(), appOrigin: null });
  const baseUrl = await listen(server, context);
  const expected = [
    ["/css/tokens.css", /^text\/css/],
    ["/css/base.css", /^text\/css/],
    ["/css/components.css", /^text\/css/],
    ["/assets/fonts/inter-400.ttf", /^font\/ttf/],
    ["/assets/fonts/space-grotesk-700.ttf", /^font\/ttf/],
    ["/assets/logo-192.png", /^image\/png/],
  ];
  for (const [path, type] of expected) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), type, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  const original = await fetch(`${baseUrl}/assets/logo-original.png`);
  assert.equal(original.status, 404, "logo original não é publicada");
});

test("manifesto usa as cores do projeto e ícones PNG existentes", async () => {
  const manifest = JSON.parse(await readFile(publicUrl("manifest.webmanifest"), "utf8"));
  assert.equal(manifest.background_color, "#0f0915");
  assert.equal(manifest.theme_color, "#281040");
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"));
  for (const icon of manifest.icons) {
    await access(publicUrl(icon.src.slice(1)));
  }
});

test("service worker lista os novos arquivos de design e nenhum caminho inexistente", async () => {
  const source = await readFile(publicUrl("sw.js"), "utf8");
  const paths = [...source.matchAll(/^\s+"(\/[^"]*)",$/gm)].map((match) => match[1]);
  for (const path of ["/css/tokens.css", "/css/base.css", "/css/components.css", "/assets/fonts/inter-400.ttf"]) {
    assert.ok(paths.includes(path), path);
  }
  for (const path of paths) {
    if (path === "/") continue;
    await access(publicUrl(path.slice(1)));
  }
});

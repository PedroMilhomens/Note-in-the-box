// Roteador cliente por History API. Sem dependência de DOM na parte de casamento de rotas.
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

export function compileRoutes(definicoes) {
  return definicoes.map((definicao) => {
    const chaves = [];
    const fonte = definicao.path
      .replace(ESCAPE, "\\$&")
      .replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, chave) => {
        chaves.push(chave);
        return "([^/]+)";
      });
    return { ...definicao, chaves, regex: new RegExp(`^${fonte}/?$`) };
  });
}

export function matchRoute(rotas, pathname) {
  for (const rota of rotas) {
    const resultado = rota.regex.exec(pathname);
    if (!resultado) continue;
    const params = {};
    for (const [indice, chave] of rota.chaves.entries()) {
      let valor;
      try {
        valor = decodeURIComponent(resultado[indice + 1]);
      } catch {
        return null;
      }
      if (valor.includes("/") || valor.includes("\\") || valor.includes("\0")) return null;
      params[chave] = valor;
    }
    return { rota, params };
  }
  return null;
}

// Aceita apenas caminhos internos; evita redirecionamento aberto via ?next=.
export function safeNextPath(valor) {
  if (typeof valor !== "string" || valor.length > 200) return null;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(valor)) return null;
  return valor;
}

export function createRouter({ routes, win = globalThis, handle }) {
  const compiladas = compileRoutes(routes);
  let sequencia = 0;

  async function resolver() {
    const id = ++sequencia;
    const url = new URL(win.location.href);
    await handle({
      match: matchRoute(compiladas, url.pathname),
      url,
      isStale: () => id !== sequencia,
    });
  }

  function navegar(destino, { replace = false } = {}) {
    const url = new URL(destino, win.location.origin);
    if (url.origin !== win.location.origin) {
      win.location.assign(url.href);
      return Promise.resolve();
    }
    win.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}`);
    return resolver();
  }

  function aoClicar(evento) {
    if (evento.defaultPrevented || evento.button !== 0) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    const ancora = evento.target.closest?.("a[href]");
    if (!ancora || ancora.target || ancora.hasAttribute("download")) return;
    const href = ancora.getAttribute("href");
    if (!href.startsWith("/") || href.startsWith("//")) return;
    const url = new URL(href, win.location.origin);
    if (!matchRoute(compiladas, url.pathname)) return;
    evento.preventDefault();
    void navegar(`${url.pathname}${url.search}`);
  }

  function iniciar() {
    win.addEventListener("popstate", () => { void resolver(); });
    win.document.addEventListener("click", aoClicar);
    return resolver();
  }

  return { iniciar, navegar, resolver };
}

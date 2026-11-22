import { NAVEGACAO } from "../routes.js";
import { h, limpar } from "./dom.js";
import { icone } from "./icones.js";

function marca(href = "/inicio") {
  return h("a", { class: "marca", href },
    h("img", { src: "/assets/logo-64.png", alt: "", width: 40, height: 40 }),
    h("span", {}, "Note in the box"));
}

function ativo(path, atual) {
  return atual === path || atual.startsWith(`${path}/`);
}

function itemLateral(item, pathname) {
  return h("li", {},
    h("a", { href: item.path, "aria-current": ativo(item.path, pathname) ? "page" : null },
      icone(item.icone), h("span", {}, item.rotulo)));
}

function itemInferior(item, pathname) {
  return h("li", {},
    h("a", { href: item.path, "aria-current": ativo(item.path, pathname) ? "page" : null },
      icone(item.icone), h("span", {}, item.rotuloCurto ?? item.rotulo)));
}

function listaClasses(classes, pathname) {
  if (!classes.length) return null;
  return h("div", { class: "lateral-classes" },
    h("h2", { class: "lateral-titulo" }, "Suas classes"),
    h("ul", {}, classes.slice(0, 12).map((classe) => h("li", {},
      h("a", {
        href: `/classes/${encodeURIComponent(classe.id)}`,
        "aria-current": pathname.startsWith(`/classes/${classe.id}`) ? "page" : null,
      }, h("span", { class: "ponto", "aria-hidden": "true" }), h("span", {}, classe.name))))));
}

// Layout: barra lateral no desktop, topo e navegação inferior no celular, <main id="conteudo">.
export function renderLayout(raiz, { pathname, offline, user, classes = [] }) {
  const nome = user?.name ?? "";
  const lateral = h("aside", { class: "app-lateral" },
    marca(),
    h("nav", { "aria-label": "Principal" },
      h("ul", { class: "lateral-nav" }, NAVEGACAO.filter((i) => i.lateral).map((i) => itemLateral(i, pathname)))),
    listaClasses(classes, pathname),
    h("div", { class: "lateral-rodape" },
      h("a", { class: "usuario", href: "/conta", "aria-label": "Minha conta" },
        h("span", { class: "avatar", "aria-hidden": "true" }, (nome[0] ?? "?").toUpperCase()),
        h("span", { class: "usuario-texto" },
          h("strong", {}, nome || "Conta"),
          h("small", {}, offline ? "Offline" : "Sincronizado"))),
      h("span", { class: "logout-status status", role: "status" }),
      h("button", { class: "btn btn-secundario btn-bloco", type: "button", "data-logout": true }, "Sair")));

  const topoMovel = h("header", { class: "app-topo-movel" },
    marca(),
    offline ? h("span", { class: "pilula" }, "Offline") : null);

  const principal = h("main", { id: "conteudo", class: "app-conteudo", tabindex: "-1" });
  const navInferior = h("nav", { class: "app-nav-inferior", "aria-label": "Principal" },
    h("ul", {}, NAVEGACAO.filter((i) => i.inferior).map((i) => itemInferior(i, pathname))));

  limpar(raiz).append(h("div", { class: "app-layout" }, lateral, topoMovel, principal, navInferior));
  return principal;
}

// Tela cheia (editor de anotação): sem barra lateral nem navegação inferior.
export function renderCheio(raiz) {
  const principal = h("main", { id: "conteudo", class: "app-cheio", tabindex: "-1" });
  limpar(raiz).append(principal);
  return principal;
}

// Páginas públicas (entrar e cadastro): sem navegação, conteúdo centralizado.
export function renderPublico(raiz) {
  const principal = h("main", { id: "conteudo", class: "conteudo-publico", tabindex: "-1" });
  limpar(raiz).append(h("div", { class: "pagina-publica" }, principal));
  return principal;
}

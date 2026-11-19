import { NAVEGACAO } from "../routes.js";
import { h, limpar } from "./dom.js";

function marca() {
  return h("a", { class: "marca", href: "/inicio" },
    h("img", { src: "/assets/logo-64.png", alt: "", width: 40, height: 40 }),
    h("span", {}, "Note in the box"));
}

function ativo(path, atual) {
  return atual === path || atual.startsWith(`${path}/`);
}

// Layout com topo, navegação (lateral no desktop, inferior no celular) e <main id="conteudo">.
export function renderLayout(raiz, { pathname, offline }) {
  const nav = h("nav", { class: "app-nav", "aria-label": "Principal" },
    h("ul", {}, NAVEGACAO.map((item) => h("li", { class: item.somenteDesktop ? "somente-desktop" : null },
      h("a", { href: item.path, "aria-current": ativo(item.path, pathname) ? "page" : null }, item.rotulo)))));

  const topo = h("header", { class: "app-topo" },
    marca(),
    h("div", { class: "app-topo-acoes" },
      offline ? h("span", { class: "status" }, "Sem conexão") : null,
      h("span", { id: "logout-status", class: "status", role: "status" }),
      h("button", { id: "logout-button", class: "btn btn-secundario", type: "button" }, "Sair")));

  const principal = h("main", { id: "conteudo", class: "app-conteudo", tabindex: "-1" });
  limpar(raiz).append(h("div", { class: "app-layout" }, topo, nav, principal));
  return principal;
}

// Páginas públicas (entrar e cadastro): sem navegação, conteúdo centralizado.
export function renderPublico(raiz) {
  const principal = h("main", { id: "conteudo", class: "conteudo-publico", tabindex: "-1" });
  limpar(raiz).append(h("div", { class: "pagina-publica" }, principal));
  return principal;
}

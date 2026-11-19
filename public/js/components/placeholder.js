import { h } from "./dom.js";

// Marcador das telas ainda não construídas. Substituído nas etapas C e D.
export function emConstrucao(titulo, etapa, links = []) {
  return h("section", { class: "em-construcao" },
    h("h1", {}, titulo),
    h("p", { class: "aviso" }, `Esta tela será construída na etapa ${etapa}.`),
    links.length
      ? h("ul", {}, links.map(({ href, rotulo }) => h("li", {}, h("a", { href }, rotulo))))
      : null);
}

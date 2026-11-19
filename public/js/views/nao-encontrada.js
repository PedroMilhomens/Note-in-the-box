import { h } from "../components/dom.js";

export const titulo = "Página não encontrada";

export function render() {
  return h("section", {},
    h("h1", {}, "Página não encontrada"),
    h("p", {}, "O endereço não existe ou você não tem acesso a ele."),
    h("a", { class: "btn", href: "/inicio" }, "Ir para o início"));
}

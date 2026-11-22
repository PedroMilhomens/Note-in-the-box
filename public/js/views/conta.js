import { h } from "../components/dom.js";
import { emConstrucao } from "../components/placeholder.js";

export const titulo = "Meus dados";

export function render({ user }) {
  const secao = emConstrucao("Meus dados", "D", [
    { href: "/meus-dados.html", rotulo: "Meus dados (versão atual)" },
    { href: "/privacidade.html", rotulo: "Privacidade" },
    { href: "/termos.html", rotulo: "Termos" },
  ]);
  secao.append(
    user ? h("p", { class: "texto-suave" }, `Conectado como ${user.name}.`) : null,
    h("span", { class: "logout-status status", role: "status" }),
    h("div", { class: "acoes" },
      h("button", { class: "btn btn-secundario", type: "button", "data-logout": true }, "Sair")));
  return secao;
}

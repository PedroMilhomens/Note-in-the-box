import { emConstrucao } from "../components/placeholder.js";

export const titulo = "Meus dados";

export function render() {
  return emConstrucao("Meus dados", "D", [{ href: "/meus-dados.html", rotulo: "Meus dados (versão atual)" }, { href: "/privacidade.html", rotulo: "Privacidade" }, { href: "/termos.html", rotulo: "Termos" }]);
}

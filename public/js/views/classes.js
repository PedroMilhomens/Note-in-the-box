import { emConstrucao } from "../components/placeholder.js";

export const titulo = "Classes";

export function render() {
  return emConstrucao("Classes", "D", [{ href: "/notes.html", rotulo: "Anotações (versão atual)" }, { href: "/forum.html", rotulo: "Fórum (versão atual)" }]);
}

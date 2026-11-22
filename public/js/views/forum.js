import { emConstrucao } from "../components/placeholder.js";

export const titulo = "Fórum";

export function render() {
  return emConstrucao("Fórum", "D4", [{ href: "/forum.html", rotulo: "Fórum (versão atual)" }]);
}

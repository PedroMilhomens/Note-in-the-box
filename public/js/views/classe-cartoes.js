import { emConstrucao } from "../components/placeholder.js";

export const titulo = "Flashcards";

export function render() {
  return emConstrucao("Flashcards", "D5", [{ href: "/flashcards.html", rotulo: "Flashcards (versão atual)" }]);
}

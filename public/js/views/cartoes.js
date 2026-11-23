import { h } from "../components/dom.js";
import { plural } from "../format.js";
import { getSessao } from "../store.js";

export const titulo = "Flashcards";

// Baralhos: uma classe = um baralho. A revisão acontece na aba Flashcards de cada classe.
export function render() {
  const { classes } = getSessao();
  if (!classes.length) {
    return h("section", {},
      h("h1", {}, "Flashcards"),
      h("p", { class: "texto-suave" }, "Entre em uma classe para começar a revisar flashcards."),
      h("a", { class: "btn", href: "/classes" }, "Ver minhas classes"));
  }
  return h("section", { class: "baralhos" },
    h("h1", {}, "Flashcards"),
    h("p", { class: "texto-suave" }, "Escolha um baralho para revisar."),
    h("ul", { class: "lista-baralhos" }, classes.map((classe) => h("li", {},
      h("a", { class: "card-baralho", href: `/classes/${encodeURIComponent(classe.id)}/cartoes` },
        h("strong", {}, classe.name),
        h("span", { class: classe.dueFlashcards ? "pilula pilula-destaque" : "pilula" },
          classe.dueFlashcards ? plural(classe.dueFlashcards, "para revisar", "para revisar") : "Em dia"))))));
}

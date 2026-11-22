import { plural } from "../format.js";
import { h } from "./dom.js";

export function cartaoClasse(classe) {
  const meta = [classe.professorName, plural(classe.memberCount, "aluno", "alunos")]
    .filter(Boolean).join(" · ");
  return h("li", {},
    h("a", { class: "card-classe", href: `/classes/${encodeURIComponent(classe.id)}` },
      h("span", { class: "card-classe-topo" },
        h("strong", { class: "card-classe-nome" }, classe.name),
        classe.dueFlashcards > 0
          ? h("span", { class: "pilula pilula-destaque" }, `${classe.dueFlashcards} p/ revisar`)
          : null),
      h("span", { class: "card-classe-meta" }, meta),
      h("span", { class: "card-classe-numeros" },
        h("span", {}, plural(classe.branchCount, "branch", "branches")),
        h("span", {}, plural(classe.noteCount, "nota", "notas")))));
}

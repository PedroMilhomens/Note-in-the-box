import { h } from "./dom.js";
import { plural } from "../format.js";

const ABAS = [
  { chave: "anotacoes", rotulo: "Anotações", sufixo: "" },
  { chave: "forum", rotulo: "Fórum", sufixo: "/forum" },
  { chave: "cartoes", rotulo: "Flashcards", sufixo: "/cartoes" },
  { chave: "membros", rotulo: "Membros", sufixo: "/membros" },
];

// Cabeçalho da classe (voltar, nome, dados) e navegação entre as abas da classe.
export function cabecalhoClasse(classe, ativa, { alunos } = {}) {
  const base = `/classes/${encodeURIComponent(classe.id)}`;
  const meta = [classe.professorName, alunos === undefined ? null : plural(alunos, "aluno", "alunos")]
    .filter(Boolean).join(" · ");
  return h("header", { class: "classe-cabecalho" },
    h("div", { class: "classe-titulo" },
      h("a", { class: "voltar", href: "/classes", "aria-label": "Voltar para Minhas classes" }, "‹"),
      h("div", {}, h("h1", {}, classe.name), meta ? h("p", { class: "texto-suave" }, meta) : null)),
    h("nav", { class: "abas", "aria-label": `Seções de ${classe.name}` },
      ABAS.map((aba) => h("a", {
        href: `${base}${aba.sufixo}`,
        "aria-current": aba.chave === ativa ? "page" : null,
      }, aba.rotulo))));
}

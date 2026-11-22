import { mensagemDeErro } from "../auth-validation.js";
import { cabecalhoClasse } from "../components/abas-classe.js";
import { h } from "../components/dom.js";

export const titulo = "Membros";

const PAPEL = { owner: "Responsável", member: "Membro" };

export async function render({ api, params }) {
  let detalhes;
  try {
    detalhes = await api.get(`/api/classes/${encodeURIComponent(params.classId)}?limit=100`);
  } catch (erro) {
    return h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo));
  }
  return h("section", {},
    cabecalhoClasse(detalhes.class, "membros", { alunos: detalhes.members.length }),
    h("ul", { class: "lista-membros" }, detalhes.members.map((membro) => h("li", { class: "card" },
      h("span", { class: "avatar", "aria-hidden": "true" }, (membro.name?.[0] ?? "?").toUpperCase()),
      h("strong", {}, membro.name),
      h("span", { class: "pilula" }, PAPEL[membro.role] ?? "Membro")))));
}

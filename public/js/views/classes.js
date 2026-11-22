import { mensagemDeErro } from "../auth-validation.js";
import { cartaoClasse } from "../components/card-classe.js";
import { h } from "../components/dom.js";

export const titulo = "Minhas classes";

export async function render({ api }) {
  let classes = [];
  let erro = null;
  try {
    ({ classes } = await api.get("/api/classes?limit=100"));
  } catch (falha) {
    erro = falha;
  }
  return h("section", {},
    h("div", { class: "cabecalho-secao" },
      h("h1", {}, "Minhas classes"),
      h("a", { class: "btn btn-destaque", href: "/inicio" }, "Criar ou entrar em uma classe")),
    erro ? h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo)) : null,
    !erro && classes.length === 0
      ? h("p", { class: "vazio" }, "Você ainda não participa de nenhuma classe.")
      : null,
    h("ul", { class: "grade-classes" }, classes.map(cartaoClasse)));
}

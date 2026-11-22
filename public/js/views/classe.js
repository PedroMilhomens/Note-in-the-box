import { mensagemDeErro } from "../auth-validation.js";
import { cabecalhoClasse } from "../components/abas-classe.js";
import { campo } from "../components/campo.js";
import { h } from "../components/dom.js";
import {
  ROTULO_STATUS, dataCurta, listaDeNomes, plural, tempoRelativo,
} from "../format.js";

export const titulo = "Classe";

const BRANCHES_VISIVEIS = 4;

function ordenarBranches(branches, idPropria) {
  return [...branches].sort((a, b) => {
    if (a.id === idPropria) return -1;
    if (b.id === idPropria) return 1;
    return String(b.lastNoteAt ?? "").localeCompare(String(a.lastNoteAt ?? ""))
      || a.ownerName.localeCompare(b.ownerName, "pt-BR");
  });
}

function listaBranches({ classId, branches, idPropria, idEscolhida, nomeProprio }) {
  const ordenadas = ordenarBranches(branches, idPropria);
  let expandida = false;
  const lista = h("ul", { class: "lista-branches" });
  const alternar = h("button", { class: "btn btn-secundario btn-bloco branches-mais", type: "button" });

  function desenhar() {
    const visiveis = expandida ? ordenadas : ordenadas.slice(0, BRANCHES_VISIVEIS);
    lista.replaceChildren(...visiveis.map((branch) => {
      const propria = branch.id === idPropria;
      const nome = propria ? `Minha branch (${nomeProprio})` : branch.ownerName;
      const quando = tempoRelativo(branch.lastNoteAt);
      return h("li", {},
        h("a", {
          class: "card-branch",
          href: `/classes/${encodeURIComponent(classId)}?branch=${encodeURIComponent(branch.id)}`,
          "aria-current": branch.id === idEscolhida ? "true" : null,
        }, h("strong", {}, nome),
        h("span", {}, [plural(branch.noteCount, "nota", "notas"), quando].filter(Boolean).join(" · "))));
    }));
    const restantes = ordenadas.length - BRANCHES_VISIVEIS;
    alternar.hidden = restantes <= 0;
    alternar.textContent = expandida ? "Ver menos" : `Ver mais ${restantes} branches`;
    alternar.setAttribute("aria-expanded", String(expandida));
  }
  alternar.addEventListener("click", () => { expandida = !expandida; desenhar(); });
  desenhar();
  return [lista, alternar];
}

function alertaAulaPerdida(classId, aula) {
  if (!aula || aula.suggestions.length === 0) return null;
  const nomes = [...new Set(aula.suggestions.map((s) => s.ownerName))];
  const primeira = aula.suggestions[0];
  return h("section", { class: "alerta-aula", "aria-label": "Aula sem anotação" },
    h("span", { class: "alerta-icone", "aria-hidden": "true" }, "!"),
    h("div", { class: "alerta-texto" },
      h("h3", {}, `Você não tem anotação da aula de ${dataCurta(aula.lessonDate)}`),
      h("p", {}, `${listaDeNomes(nomes)} ${nomes.length > 1 ? "já anotaram" : "já anotou"} essa aula. Veja a versão e referencie na sua branch.`)),
    h("a", {
      class: "btn",
      href: `/classes/${encodeURIComponent(classId)}/notas/${encodeURIComponent(primeira.noteId)}`,
    }, `Ver versão de ${primeira.ownerName}`));
}

function cartaoNota(classId, nota) {
  const meta = [
    dataCurta(nota.lessonDate),
    plural(nota.referenceCount, "referência", "referências"),
    plural(nota.commentCount, "comentário", "comentários"),
  ].filter(Boolean).join(" · ");
  return h("li", {},
    h("a", { class: "card-nota", href: `/classes/${encodeURIComponent(classId)}/notas/${encodeURIComponent(nota.id)}` },
      h("span", { class: "card-nota-texto" }, h("strong", {}, nota.title), h("span", {}, meta)),
      h("span", { class: nota.status === "incomplete" ? "pilula pilula-destaque" : "pilula" }, ROTULO_STATUS[nota.status] ?? nota.status)));
}

function formularioNovaNota({ api, classId, branchId, navegar }) {
  const titulo = campo({ id: "nota-titulo", rotulo: "Título", nome: "title", placeholder: "Ex.: Aula 08 · Integrais", maxlength: 200 });
  const data = campo({ id: "nota-data", rotulo: "Data da aula (opcional)", tipo: "date", nome: "lessonDate" });
  const aviso = h("p", { class: "aviso aviso-erro", role: "alert", hidden: true });
  const botao = h("button", { class: "btn btn-destaque", type: "submit" }, "Criar anotação");
  const form = h("form", { class: "card painel-form", id: "nova-nota", novalidate: true, hidden: true, "aria-label": "Nova anotação" },
    h("h3", {}, "Nova anotação"), aviso, titulo.raiz, data.raiz, botao);

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    aviso.hidden = true;
    titulo.mostrarErro(null);
    const texto = titulo.input.value.trim();
    if (!texto) {
      titulo.mostrarErro("Informe o título da anotação.");
      titulo.input.focus();
      return;
    }
    botao.disabled = true;
    try {
      const { note } = await api.post(
        `/api/classes/${encodeURIComponent(classId)}/branches/${encodeURIComponent(branchId)}/notes`,
        { title: texto, lessonDate: data.input.value || null },
      );
      await navegar(`/classes/${encodeURIComponent(classId)}/notas/${encodeURIComponent(note.id)}`);
    } catch (erro) {
      aviso.textContent = mensagemDeErro(erro.codigo);
      aviso.hidden = false;
      botao.disabled = false;
    }
  });
  return form;
}

export async function render({ api, params, url, user, navegar }) {
  const classId = params.classId;
  let detalhes;
  try {
    detalhes = await api.get(`/api/classes/${encodeURIComponent(classId)}?limit=100`);
  } catch (erro) {
    return h("section", {},
      h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo)),
      h("a", { class: "btn", href: "/classes" }, "Voltar para Minhas classes"));
  }

  const propria = detalhes.branches.find((branch) => branch.ownerId === user?.id);
  const escolhida = detalhes.branches.find((branch) => branch.id === url.searchParams.get("branch"))
    ?? propria ?? detalhes.branches[0];
  const ehMinha = Boolean(escolhida && propria && escolhida.id === propria.id);
  const nomeProprio = (user?.name ?? "").split(/\s+/)[0] || "você";

  let notas = [];
  let erroNotas = null;
  let aula = null;
  if (escolhida) {
    const base = `/api/classes/${encodeURIComponent(classId)}`;
    const [resultadoNotas, resultadoAulas] = await Promise.allSettled([
      api.get(`${base}/branches/${encodeURIComponent(escolhida.id)}/notes?limit=100`),
      ehMinha ? api.get(`${base}/missed-lessons?limit=1`) : Promise.resolve(null),
    ]);
    if (resultadoNotas.status === "fulfilled") notas = resultadoNotas.value.notes;
    else erroNotas = resultadoNotas.reason;
    if (resultadoAulas.status === "fulfilled") aula = resultadoAulas.value?.lessons?.[0] ?? null;
  }

  const formulario = ehMinha
    ? formularioNovaNota({ api, classId, branchId: escolhida.id, navegar })
    : null;
  function abrirFormulario() {
    if (!formulario) return;
    formulario.hidden = false;
    formulario.querySelector("input")?.focus();
    formulario.scrollIntoView({ block: "center" });
  }
  const botaoNova = ehMinha ? h("button", { class: "btn btn-destaque", type: "button", "aria-controls": "nova-nota" }, "+ Nova anotação") : null;
  botaoNova?.addEventListener("click", abrirFormulario);
  const fab = ehMinha ? h("button", { class: "fab", type: "button", "aria-label": "Nova anotação" }, "+") : null;
  fab?.addEventListener("click", abrirFormulario);

  const tituloNotas = ehMinha ? "Anotações da minha branch" : `Anotações de ${escolhida?.ownerName ?? ""}`;

  return h("div", { class: "classe" },
    cabecalhoClasse(detalhes.class, "anotacoes", { alunos: detalhes.members.length }),
    h("div", { class: "classe-grade" },
      h("aside", { class: "classe-branches", "aria-label": "Branches da classe" },
        h("h2", { class: "lateral-titulo" }, "Branches da classe"),
        ...listaBranches({
          classId, branches: detalhes.branches, idPropria: propria?.id, idEscolhida: escolhida?.id, nomeProprio,
        })),
      h("section", { class: "classe-notas", "aria-labelledby": "notas-titulo" },
        h("div", { class: "cabecalho-secao" }, h("h2", { id: "notas-titulo" }, tituloNotas), botaoNova),
        formulario,
        ehMinha ? alertaAulaPerdida(classId, aula) : null,
        erroNotas ? h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erroNotas.codigo)) : null,
        !erroNotas && notas.length === 0
          ? h("p", { class: "vazio" }, ehMinha ? "Você ainda não tem anotações nesta classe. Crie a primeira." : "Esta branch ainda não tem anotações.")
          : null,
        h("ul", { class: "lista-notas" }, notas.map((nota) => cartaoNota(classId, nota)))),
      h("aside", { class: "classe-lateral", "aria-label": "Sobre a rede de notas" },
        h("h2", { class: "lateral-titulo" }, "Rede de notas"),
        h("div", { class: "card" },
          h("p", { class: "texto-suave" }, "Cada ligação é uma referência entre anotações, suas ou de colegas. Quanto mais você conecta, mais fácil fica revisar.")),
        "serviceWorker" in navigator
          ? h("div", { class: "card card-offline" },
            h("strong", {}, "Offline ativo"),
            h("p", { class: "texto-suave" }, "Suas notas ficam salvas no aparelho e sincronizam quando houver internet."))
          : null)),
    fab);
}

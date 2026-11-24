import { mensagemDeErro } from "../auth-validation.js";
import { cabecalhoClasse } from "../components/abas-classe.js";
import { h } from "../components/dom.js";
import { abrirDialogo } from "../components/nota/dialogo.js";

export const titulo = "Configuração";

const enc = encodeURIComponent;

export async function render({ api, params, user, toast, navegar }) {
  const { classId } = params;
  const base = `/api/classes/${enc(classId)}`;
  let detalhes;
  try {
    detalhes = await api.get(`${base}?limit=100`);
  } catch (erro) {
    return h("section", {},
      h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo)),
      h("a", { class: "btn", href: "/classes" }, "Voltar para Minhas classes"));
  }

  const classe = detalhes.class;
  const proprietario = detalhes.members.find((m) => m.id === user.id && m.role === "owner");
  if (!proprietario) {
    return h("section", {},
      h("p", { class: "aviso aviso-erro", role: "alert" }, "Apenas o responsável pode acessar as configurações."),
      h("a", { class: "btn", href: `/classes/${enc(classId)}` }, "Voltar para a classe"));
  }

  const campoNome = h("input", { id: "cfg-nome", type: "text", maxlength: 100, value: classe.name });
  const campoProfessor = h("input", { id: "cfg-professor", type: "text", maxlength: 120, value: classe.professorName ?? "" });

  const formulario = h("form", { class: "card" },
    h("h2", {}, "Dados da classe"),
    h("div", { class: "campo" }, h("label", { for: "cfg-nome" }, "Nome da classe"), campoNome),
    h("div", { class: "campo" }, h("label", { for: "cfg-professor" }, "Nome do professor (opcional)"), campoProfessor),
    h("button", { class: "btn", type: "submit" }, "Salvar alterações"));
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nome = campoNome.value.trim();
    const professorName = campoProfessor.value.trim() || null;
    if (!nome) {
      toast("O nome da classe é obrigatório.", { tipo: "erro" });
      return;
    }
    const btn = formulario.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api.patch(base, { name: nome, professorName });
      toast("Classe atualizada.", { tipo: "sucesso" });
      // Atualizar a view atual sem recarregar
      classe.name = nome;
      classe.professorName = professorName;
      // Forçar atualização do cabeçalho (navegar para mesma rota recarrega)
      await navegar(`/classes/${enc(classId)}/configuracao`);
    } catch (erro) {
      toast(mensagemDeErro(erro.codigo), { tipo: "erro" });
    } finally {
      btn.disabled = false;
    }
  });

  const secaoExcluir = h("section", { class: "card secao-perigo" },
    h("h2", {}, "Excluir classe"),
    h("p", { class: "texto-suave" }, "Esta ação é irreversível. Todas as anotações, flashcards, fórum e membros da classe serão removidos permanentemente."),
    h("button", { class: "btn btn-perigo", type: "button" }, "Excluir classe permanentemente"));
  const btnExcluir = secaoExcluir.querySelector("button");
  btnExcluir?.addEventListener("click", () => {
    const inputConfirmacao = h("input", { type: "text", placeholder: "Digite o nome da classe", autocomplete: "off", required: true, maxLength: 100 });
    abrirDialogo({
      titulo: "Excluir classe permanentemente",
      descricao: [
        h("p", { class: "texto-suave" }, "Para confirmar, digite o nome exato da classe: "),
        h("strong", {}, classe.name)
      ],
      conteudo: [h("div", { class: "campo" }, h("label", { for: "dlg-confirmar-nome" }, "Nome da classe"), inputConfirmacao)],
      confirmar: "Excluir",
      perigo: true,
      aoConfirmar: async () => {
        const valor = inputConfirmacao.value.trim();
        if (valor !== classe.name) {
          throw new Error("Nome incorreto. Exclusão cancelada.");
        }
        btnExcluir.disabled = true;
        try {
          await api.delete(base);
          toast("Classe excluída.", { tipo: "sucesso" });
          await navegar("/classes");
        } catch (erro) {
          toast(mensagemDeErro(erro.codigo), { tipo: "erro" });
        } finally {
          btnExcluir.disabled = false;
        }
      },
    });
    inputConfirmacao.focus();
  });

  return h("section", { class: "configuracao-pagina" },
    cabecalhoClasse(classe, "configuracao", { alunos: detalhes.members.length }),
    h("div", { class: "configuracao-grade" },
      h("div", { class: "configuracao-principal" }, formulario, secaoExcluir),
      h("aside", { class: "configuracao-lateral" },
        h("section", { class: "card" },
          h("h2", {}, "Informações"),
          h("dl", { class: "info-lista" },
            h("dt", {}, "Criada em"),
            h("dd", {}, new Date(classe.createdAt).toLocaleDateString("pt-BR", { dateStyle: "long" })),
            h("dt", {}, "Responsável"),
            h("dd", {}, user.name)
          )
        )
      )
    )
  );
}
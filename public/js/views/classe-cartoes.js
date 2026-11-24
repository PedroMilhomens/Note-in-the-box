import { mensagemDeErro } from "../auth-validation.js";
import { cabecalhoClasse } from "../components/abas-classe.js";
import { h } from "../components/dom.js";
import { plural } from "../format.js";

export const titulo = "Flashcards";

const enc = encodeURIComponent;
const NOTAS = [
  { valor: "errei", rotulo: "Errei" },
  { valor: "dificil", rotulo: "Difícil" },
  { valor: "bom", rotulo: "Bom" },
  { valor: "facil", rotulo: "Fácil" },
];
const TAMANHO_FILA = 50;

export async function render({ api, params, toast, atualizarClasses, navegar }) {
  const { classId } = params;
  const base = `/api/classes/${enc(classId)}`;
  let detalhes;
  let devidos;
  let todos;
  let desempenho;
  try {
    [detalhes, devidos, todos, desempenho] = await Promise.all([
      api.get(`${base}?limit=100`),
      api.get(`${base}/flashcards/due?limit=${TAMANHO_FILA}`),
      api.get(`${base}/flashcards?limit=100`),
      api.get(`${base}/flashcards/performance`),
    ]);
  } catch (erro) {
    return h("section", {},
      h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo)),
      h("a", { class: "btn", href: "/classes" }, "Voltar para Minhas classes"));
  }

  const fila = [...devidos.cards];
  const total = fila.length;
  let indice = 0;
  let revelada = false;
  let enviando = false;
  let cartaoAtual = null;

  const area = h("section", { class: "revisao", "aria-label": "Revisão de flashcards" });
  const colunaLateral = h("aside", { class: "revisao-lateral" });

  function desenharRevisao() {
    if (!total || indice >= total) {
      const botoes = [];
      if (total) {
        botoes.push(h("button", {
          class: "btn btn-secundario",
          type: "button"
        }, "Revisar novamente"));
      }
      area.replaceChildren(h("div", { class: "cartao-revisao cartao-vazio" },
        h("h2", {}, total ? "Revisão concluída" : "Nada para revisar agora"),
        h("p", { class: "texto-suave" }, total
          ? `Você revisou ${plural(total, "cartão", "cartões")} nesta sessão.`
          : "Crie flashcards a partir das suas anotações ou pelo formulário ao lado."),
        h("div", { class: "acoes" }, ...botoes)));
      if (total) {
        const btnRevisar = area.querySelector("button.btn-secundario");
        btnRevisar?.addEventListener("click", reiniciarRevisao);
      }
      return;
    }
    const carta = fila[indice];
    cartaoAtual = carta;
    const progresso = h("progress", { class: "revisao-barra", max: total, value: indice, "aria-label": "Progresso da revisão" });
    const resposta = h("p", { class: "cartao-resposta" }, carta.answer);
    const notas = h("div", { class: "revisao-notas", role: "group", "aria-label": "Como foi?", hidden: true },
      NOTAS.map((nota, i) => {
        const botao = h("button", { class: `btn btn-secundario${nota.valor === "bom" ? " btn-marcado" : ""}`, type: "button", "data-nota": nota.valor },
          h("span", { class: "tecla", "aria-hidden": "true" }, String(i + 1)), nota.rotulo);
        botao.addEventListener("click", () => avaliar(nota.valor));
        return botao;
      }));
    // Botão para resetar revisão deste cartão
    const btnResetar = h("button", { class: "btn btn-ghost btn-pequeno", type: "button", style: "margin-top: var(--espaco-3);" }, "Resetar revisão deste cartão");
    btnResetar.addEventListener("click", async () => {
      if (!confirm("Tem certeza? Isso vai permitir revisar este cartão novamente agora.")) return;
      try {
        await api.post(`/api/flashcards/${enc(carta.id)}/reset-review`);
        toast("Revisão resetada. O cartão voltará para a fila.", { tipo: "sucesso" });
        // Recarregar a fila de devidos
        const { cards } = await api.get(`${base}/flashcards/due?limit=${TAMANHO_FILA}`);
        fila.length = 0;
        fila.push(...cards);
        desenharRevisao();
        void atualizarClasses?.();
      } catch (erro) {
        toast(mensagemDeErro(erro.codigo), { tipo: "erro" });
      }
    });
    notas.appendChild(btnResetar);

    const cartaoFrente = h("div", { class: "cartao-frente" },
      carta.noteTitle ? h("span", { class: "pilula pilula-destaque" }, carta.noteTitle) : null,
      h("span", { class: "cartao-rotulo" }, "Pergunta"),
      h("h2", { class: "cartao-pergunta" }, carta.question));

    const cartaoVerso = h("div", { class: "cartao-verso" },
      h("span", { class: "cartao-rotulo" }, "Resposta"),
      resposta,
      notas);

    const cartaoInner = h("div", { class: "cartao-inner", tabindex: "0", role: "button", "aria-label": "Virar cartão para ver a resposta" }, cartaoFrente, cartaoVerso);
    const cartaoRevisao = h("div", { class: "cartao-revisao" }, cartaoInner);

    function revelar() {
      if (revelada) return;
      revelada = true;
      cartaoRevisao.classList.add("virado");
      notas.hidden = false;
      notas.querySelector("[data-nota=bom]").focus();
    }

    // Click/tap no cartão para virar
    cartaoInner.addEventListener("click", revelar);
    cartaoInner.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        revelar();
      }
    });

    area.replaceChildren(
      h("div", { class: "revisao-topo" },
        h("p", { class: "texto-suave" }, `Cartão ${indice + 1} de ${total}`), progresso),
      cartaoRevisao,
      notas);
    revelada = false;
  }

  function reiniciarRevisao() {
    indice = 0;
    desenharRevisao();
  }

  async function avaliar(valor) {
    if (enviando || !revelada) return;
    enviando = true;
    try {
      await api.post(`/api/flashcards/${enc(fila[indice].id)}/review`, { rating: valor });
      indice += 1;
      desenharRevisao();
      void atualizarClasses?.();
    } catch (erro) {
      toast(erro.message, { tipo: "erro" });
    } finally {
      enviando = false;
    }
  }

  function aoTeclar(evento) {
    if (!area.isConnected) { document.removeEventListener("keydown", aoTeclar); return; }
    if (evento.target instanceof HTMLElement && evento.target.closest("input, textarea, select, dialog")) return;
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (evento.key === " " && !revelada && indice < total) {
      if (evento.target instanceof HTMLButtonElement) return;
      evento.preventDefault();
      area.revelar?.();
    } else if (revelada && /^[1-4]$/.test(evento.key)) {
      avaliar(NOTAS[Number(evento.key) - 1].valor);
    }
  }
  document.addEventListener("keydown", aoTeclar);

  // ---- novo flashcard ----
  const campoPergunta = h("input", { id: "fc-nova-pergunta", type: "text", maxlength: 300, placeholder: "Digite a pergunta" });
  const campoResposta = h("textarea", { id: "fc-nova-resposta", rows: 3, maxlength: 1000, placeholder: "Digite a resposta" });
  const salvar = h("button", { class: "btn btn-bloco", type: "submit" }, "Salvar flashcard");
  const formulario = h("form", { class: "card revisao-form" },
    h("h2", {}, "Novo flashcard"),
    h("div", { class: "campo" }, h("label", { for: "fc-nova-pergunta" }, "Pergunta"), campoPergunta),
    h("div", { class: "campo" }, h("label", { for: "fc-nova-resposta" }, "Resposta"), campoResposta),
    salvar);
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!campoPergunta.value.trim() || !campoResposta.value.trim()) {
      toast("Preencha a pergunta e a resposta.", { tipo: "erro" });
      return;
    }
    salvar.disabled = true;
    try {
      await api.post(`${base}/flashcards`, { question: campoPergunta.value, answer: campoResposta.value });
      toast("Flashcard criado.", { tipo: "sucesso" });
      void atualizarClasses?.();
      await navegar(`/classes/${enc(classId)}/cartoes`);
    } catch (erro) {
      toast(erro.message, { tipo: "erro" });
      salvar.disabled = false;
    }
  });

  // ---- desempenho da semana ----
  const somar = (chave) => desempenho.days.reduce((acc, dia) => acc + (dia.ratings?.[chave] ?? 0), 0);
  const acertos = desempenho.totalReviews ? Math.round(((somar("bom") + somar("facil")) / desempenho.totalReviews) * 100) : null;
  const cartaoDesempenho = h("section", { class: "card revisao-desempenho", "aria-label": "Desempenho da semana" },
    h("h2", {}, "Desempenho da semana"),
    h("div", { class: "desempenho-linha" }, h("span", {}, "Acertos"), h("strong", {}, acertos === null ? "—" : `${acertos}%`)),
    acertos === null ? null : h("progress", { max: 100, value: acertos, "aria-label": "Percentual de acertos" }),
    h("div", { class: "desempenho-linha" }, h("span", {}, "Cartões revisados"), h("strong", {}, String(desempenho.totalReviews))));

  const dica = h("p", { class: "dica" }, "Dica: selecione um trecho em qualquer anotação e use “Criar flashcard” no editor.");

  // ---- todos os cartões ----
  let listaCartoesAtual = todos.cards;

  function criarItemCartao(c) {
    const li = h("li", { class: "card cartao-item", "data-id": c.id });
    const conteudo = h("div", {},
      h("strong", {}, c.question),
      h("span", { class: "texto-suave" }, c.answer));
    const acoes = h("div", { class: "cartao-acoes" },
      h("button", { class: "btn btn-pequeno btn-secundario", type: "button", "aria-label": "Editar" }, "Editar"),
      h("button", { class: "btn btn-pequeno btn-perigo", type: "button", "aria-label": "Excluir" }, "Excluir"));
    li.append(conteudo, acoes);

    // Event listeners
    const btnEditar = li.querySelector("button[aria-label='Editar']");
    const btnExcluir = li.querySelector("button[aria-label='Excluir']");

    btnEditar?.addEventListener("click", () => abrirEdicao(c, li, conteudo));
    btnExcluir?.addEventListener("click", () => excluirCartao(c.id, li));

    return li;
  }

  async function excluirCartao(cardId, liElement) {
    if (!confirm("Tem certeza que deseja excluir este flashcard?")) return;
    try {
      await api.delete(`/api/flashcards/${enc(cardId)}`);
      toast("Flashcard excluído.", { tipo: "sucesso" });
      liElement.remove();
      void atualizarClasses?.();
      // Recarregar a lista
      const { cards } = await api.get(`${base}/flashcards?limit=100`);
      listaCartoesAtual = cards;
      // Atualizar contador no summary
      const details = document.querySelector("details.todos-cartoes");
      if (details) {
        const summary = details.querySelector("summary");
        summary.textContent = `Todos os cartões (${cards.length})`;
      }
    } catch (erro) {
      toast(mensagemDeErro(erro.codigo), { tipo: "erro" });
    }
  }

  function abrirEdicao(c, liElement, conteudoElement) {
    const inputPergunta = h("input", { type: "text", value: c.question, maxlength: 300 });
    const inputResposta = h("textarea", { rows: 3, maxlength: 1000, value: c.answer });
    const btnSalvar = h("button", { class: "btn btn-pequeno", type: "button" }, "Salvar");
    const btnCancelar = h("button", { class: "btn btn-pequeno btn-secundario", type: "button" }, "Cancelar");
    const acoesEdicao = h("div", { class: "cartao-acoes" }, btnSalvar, btnCancelar);

    conteudoElement.replaceChildren(
      h("div", { class: "campo" }, h("label", {}, "Pergunta"), inputPergunta),
      h("div", { class: "campo" }, h("label", {}, "Resposta"), inputResposta),
      acoesEdicao);

    btnCancelar?.addEventListener("click", () => {
      conteudoElement.replaceChildren(
        h("strong", {}, c.question),
        h("span", { class: "texto-suave" }, c.answer));
      const acoes = h("div", { class: "cartao-acoes" },
        h("button", { class: "btn btn-pequeno btn-secundario", type: "button", "aria-label": "Editar" }, "Editar"),
        h("button", { class: "btn btn-pequeno btn-perigo", type: "button", "aria-label": "Excluir" }, "Excluir"));
      const btnEditarNovo = acoes.querySelector("button[aria-label='Editar']");
      const btnExcluirNovo = acoes.querySelector("button[aria-label='Excluir']");
      btnEditarNovo?.addEventListener("click", () => abrirEdicao(c, liElement, conteudoElement));
      btnExcluirNovo?.addEventListener("click", () => excluirCartao(c.id, liElement));
      liElement.querySelector(".cartao-acoes")?.replaceWith(acoes);
    });

    btnSalvar?.addEventListener("click", async () => {
      if (!inputPergunta.value.trim() || !inputResposta.value.trim()) {
        toast("Preencha a pergunta e a resposta.", { tipo: "erro" });
        return;
      }
      btnSalvar.disabled = true;
      try {
        await api.patch(`/api/flashcards/${enc(c.id)}`, {
          question: inputPergunta.value,
          answer: inputResposta.value
        });
        toast("Flashcard atualizado.", { tipo: "sucesso" });
        c.question = inputPergunta.value;
        c.answer = inputResposta.value;
        conteudoElement.replaceChildren(
          h("strong", {}, c.question),
          h("span", { class: "texto-suave" }, c.answer));
        const acoes = h("div", { class: "cartao-acoes" },
          h("button", { class: "btn btn-pequeno btn-secundario", type: "button", "aria-label": "Editar" }, "Editar"),
          h("button", { class: "btn btn-pequeno btn-perigo", type: "button", "aria-label": "Excluir" }, "Excluir"));
        const btnEditarNovo = acoes.querySelector("button[aria-label='Editar']");
        const btnExcluirNovo = acoes.querySelector("button[aria-label='Excluir']");
        btnEditarNovo?.addEventListener("click", () => abrirEdicao(c, liElement, conteudoElement));
        btnExcluirNovo?.addEventListener("click", () => excluirCartao(c.id, liElement));
        liElement.querySelector(".cartao-acoes")?.replaceWith(acoes);
        void atualizarClasses?.();
      } catch (erro) {
        toast(mensagemDeErro(erro.codigo), { tipo: "erro" });
      } finally {
        btnSalvar.disabled = false;
      }
    });

    liElement.querySelector(".cartao-acoes")?.replaceWith(acoesEdicao);
  }

  const lista = listaCartoesAtual.length
    ? h("ul", { class: "lista-cartoes" }, listaCartoesAtual.map(criarItemCartao))
    : h("p", { class: "texto-suave" }, "Esta classe ainda não tem flashcards.");
  const todosCartoes = h("details", { class: "todos-cartoes" },
    h("summary", {}, `Todos os cartões (${listaCartoesAtual.length})`), lista);

  colunaLateral.append(formulario, cartaoDesempenho, dica);
  desenharRevisao();
  return h("section", { class: "revisao-pagina" },
    cabecalhoClasse(detalhes.class, "cartoes", { alunos: detalhes.members.length }),
    h("div", { class: "revisao-grade" }, h("div", { class: "revisao-principal" }, area, todosCartoes), colunaLateral));
}
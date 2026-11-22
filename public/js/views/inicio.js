import { mensagemDeErro } from "../auth-validation.js";
import { campo } from "../components/campo.js";
import { cartaoClasse } from "../components/card-classe.js";
import { h } from "../components/dom.js";
import { plural } from "../format.js";

export const titulo = "Início";

function painelCriar({ api, onCriada }) {
  const nome = campo({ id: "nova-nome", rotulo: "Nome da classe", nome: "name", placeholder: "Ex.: Cálculo II", maxlength: 100 });
  const professor = campo({ id: "nova-professor", rotulo: "Professor(a) (opcional)", nome: "professorName", placeholder: "Ex.: Prof. Marta Lima", maxlength: 120 });
  const aviso = h("div", { class: "aviso aviso-erro", role: "alert", hidden: true });
  const botao = h("button", { class: "btn btn-destaque", type: "submit" }, "Criar classe");
  const resultado = h("div", { class: "aviso aviso-sucesso resultado-criacao", role: "status", hidden: true });
  const form = h("form", { class: "card painel-form", novalidate: true, "aria-label": "Criar nova classe" },
    h("h3", {}, "Criar nova classe"), aviso, nome.raiz, professor.raiz, botao);

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    aviso.hidden = true;
    nome.mostrarErro(null);
    const valor = nome.input.value.trim();
    if (!valor) {
      nome.mostrarErro("Informe o nome da classe.");
      nome.input.focus();
      return;
    }
    botao.disabled = true;
    try {
      const corpo = await api.post("/api/classes", {
        name: valor,
        professorName: professor.input.value.trim() || undefined,
      });
      form.hidden = true;
      form.reset();
      const codigo = h("code", { class: "codigo-convite" }, corpo.inviteCode);
      const copiar = h("button", { class: "btn btn-secundario", type: "button" }, "Copiar código");
      copiar.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(corpo.inviteCode);
          copiar.textContent = "Código copiado";
        } catch {
          const faixa = document.createRange();
          faixa.selectNodeContents(codigo);
          getSelection().removeAllRanges();
          getSelection().addRange(faixa);
          copiar.textContent = "Selecione e copie";
        }
      });
      resultado.replaceChildren(
        h("p", {}, h("strong", {}, `Classe “${corpo.class.name}” criada.`)),
        h("p", {}, "Este é o código de convite. Ele só aparece agora; guarde-o para chamar os colegas:"),
        codigo,
        h("div", { class: "acoes" }, copiar,
          h("a", { class: "btn", href: `/classes/${encodeURIComponent(corpo.class.id)}` }, "Abrir classe")));
      resultado.hidden = false;
      resultado.focus?.();
      await onCriada();
    } catch (erro) {
      aviso.textContent = mensagemDeErro(erro.codigo);
      aviso.hidden = false;
    } finally {
      botao.disabled = false;
    }
  });

  return { form, resultado };
}

function painelEntrar({ api, navegar, atualizarClasses }) {
  const codigo = campo({ id: "convite", rotulo: "Código da classe", nome: "inviteCode", placeholder: "Cole o código de convite", maxlength: 43 });
  const botao = h("button", { class: "btn", type: "submit" }, "Entrar");
  const form = h("form", { class: "entrar-classe", id: "entrar-classe", novalidate: true, "aria-labelledby": "entrar-titulo" },
    h("div", { class: "entrar-texto" },
      h("h3", { id: "entrar-titulo" }, "Entrar em uma classe existente"),
      h("p", {}, "Peça o código de convite ao colega que criou a classe.")),
    h("div", { class: "entrar-campos" }, codigo.raiz, botao));

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    codigo.mostrarErro(null);
    const valor = codigo.input.value.trim();
    if (!valor) {
      codigo.mostrarErro("Informe o código da classe.");
      codigo.input.focus();
      return;
    }
    botao.disabled = true;
    try {
      const corpo = await api.post("/api/classes/join", { inviteCode: valor });
      await atualizarClasses();
      await navegar(`/classes/${encodeURIComponent(corpo.class.id)}`);
    } catch (erro) {
      codigo.mostrarErro(mensagemDeErro(erro.codigo));
      codigo.input.focus();
      botao.disabled = false;
    }
  });
  return form;
}

function cartaoPomodoro() {
  return h("section", { class: "card card-lateral", "aria-labelledby": "pomodoro-titulo" },
    h("div", { class: "card-lateral-topo" },
      h("h2", { id: "pomodoro-titulo" }, "Pomodoro"),
      h("a", { class: "pilula", href: "/foco" }, "Modo foco")),
    h("p", { class: "relogio-previa" }, "25:00"),
    h("p", { class: "texto-suave" }, "Foco de 25 min, pausa de 5 min e pausa longa de 15 min a cada 4 ciclos."),
    h("a", { class: "btn btn-destaque btn-bloco", href: "/foco" }, "Iniciar foco"));
}

function cartaoRevisao(total) {
  return h("section", { class: "card card-lateral", "aria-labelledby": "revisao-titulo" },
    h("p", { class: "texto-suave", id: "revisao-titulo" }, "Revisão de hoje"),
    h("p", { class: "numero-grande" }, plural(total, "flashcard", "flashcards")),
    h("a", { class: "btn btn-bloco", href: "/cartoes" }, total > 0 ? "Começar revisão" : "Ver flashcards"));
}

export async function render({ api, user, navegar, atualizarClasses }) {
  let classes;
  let erroCarga = null;
  try {
    ({ classes } = await api.get("/api/classes?limit=100"));
  } catch (erro) {
    classes = [];
    erroCarga = erro;
  }

  const lista = h("ul", { class: "grade-classes" });
  const vazio = h("p", { class: "vazio" }, "Você ainda não participa de nenhuma classe. Crie uma ou entre com um código de convite.");
  const subtitulo = h("p", { class: "texto-suave" });
  const lateral = h("aside", { class: "inicio-lateral", "aria-label": "Estudo" });

  function desenhar() {
    const totalRevisar = classes.reduce((soma, classe) => soma + classe.dueFlashcards, 0);
    lista.replaceChildren(...classes.map(cartaoClasse));
    vazio.hidden = classes.length > 0;
    subtitulo.textContent = totalRevisar > 0
      ? `Hoje você tem ${plural(totalRevisar, "flashcard", "flashcards")} para revisar.`
      : "Nenhum flashcard para revisar hoje.";
    lateral.replaceChildren(cartaoPomodoro(), cartaoRevisao(totalRevisar));
  }

  async function recarregar() {
    classes = await atualizarClasses();
    desenhar();
  }

  const criar = painelCriar({ api, onCriada: recarregar });
  criar.form.hidden = true;
  const entrar = painelEntrar({ api, navegar, atualizarClasses });

  const botaoCriar = h("button", { class: "btn btn-destaque", type: "button", "aria-expanded": "false", "aria-controls": criar.form.id || "criar-classe" }, "+ Criar nova classe");
  criar.form.id = "criar-classe";
  botaoCriar.addEventListener("click", () => {
    criar.form.hidden = !criar.form.hidden;
    botaoCriar.setAttribute("aria-expanded", String(!criar.form.hidden));
    if (!criar.form.hidden) criar.form.querySelector("input")?.focus();
  });
  const botaoEntrar = h("button", { class: "btn btn-secundario", type: "button" }, "Entrar em uma classe");
  botaoEntrar.addEventListener("click", () => entrar.querySelector("input")?.focus());

  desenhar();
  const primeiroNome = (user?.name ?? "").split(/\s+/)[0];
  return h("div", { class: "inicio-grade" },
    h("section", { class: "inicio-principal" },
      h("header", { class: "inicio-cabecalho" },
        h("h1", {}, primeiroNome ? `Olá, ${primeiroNome}` : "Olá"),
        subtitulo),
      erroCarga
        ? h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erroCarga.codigo))
        : null,
      h("div", { class: "cabecalho-secao" },
        h("h2", {}, "Minhas classes"),
        h("div", { class: "acoes" }, botaoEntrar, botaoCriar)),
      criar.form,
      criar.resultado,
      vazio,
      lista,
      entrar),
    lateral);
}

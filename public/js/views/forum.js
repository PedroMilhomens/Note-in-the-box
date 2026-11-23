import { mensagemDeErro } from "../auth-validation.js";
import { cabecalhoClasse } from "../components/abas-classe.js";
import { abrirDenuncia } from "../components/denuncia.js";
import { h } from "../components/dom.js";
import { abrirDialogo } from "../components/nota/dialogo.js";
import { plural, tempoRelativo } from "../format.js";

export const titulo = "Fórum";

const enc = encodeURIComponent;

export async function render({ api, params, url, user, navegar, toast }) {
  const { classId } = params;
  const base = `/api/classes/${enc(classId)}`;
  const rota = `/classes/${enc(classId)}/forum`;
  let detalhes;
  let topicos;
  try {
    [detalhes, topicos] = await Promise.all([
      api.get(`${base}?limit=100`),
      api.get(`${base}/forum/topics?limit=100`),
    ]);
  } catch (erro) {
    return h("section", {},
      h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo)),
      h("a", { class: "btn", href: "/classes" }, "Voltar para Minhas classes"));
  }
  const souResponsavel = detalhes.members.find((m) => m.id === user.id || m.userId === user.id)?.role === "owner";
  const lista = topicos.topics;
  const idAberto = url.searchParams.get("topico");
  const falhar = (erro) => toast(erro.message, { tipo: "erro" });

  // ---- regras da classe ----
  let regras = detalhes.class.rules ?? "";
  const textoRegras = h("p", { class: "regras-texto" });
  const desenharRegras = () => {
    textoRegras.textContent = regras || "O responsável ainda não publicou regras.";
  };
  desenharRegras();
  const cartaoRegras = h("section", { class: "card forum-regras", "aria-labelledby": "forum-regras-t" },
    h("h2", { id: "forum-regras-t" }, "Regras da classe"), textoRegras);
  if (souResponsavel) {
    const editar = h("button", { class: "btn-texto", type: "button" }, "Editar regras");
    editar.addEventListener("click", () => {
      const area = h("textarea", { id: "regras-area", rows: 6, maxlength: 2000 });
      area.value = regras;
      abrirDialogo({
        titulo: "Regras da classe",
        conteudo: [h("div", { class: "campo" }, h("label", { for: "regras-area" }, "Regras"), area)],
        confirmar: "Salvar regras",
        aoConfirmar: async () => {
          const r = await api.patch(`${base}/rules`, { rules: area.value });
          regras = r.class.rules ?? "";
          desenharRegras();
          toast("Regras salvas.", { tipo: "sucesso" });
        },
      });
    });
    cartaoRegras.append(editar);
  }

  // ---- novo tópico ----
  async function novoTopico() {
    let notas = [];
    try { ({ notes: notas } = await api.get(`${base}/forum/notes?limit=100`)); } catch { /* o vínculo com nota é opcional */ }
    const campoTitulo = h("input", { id: "top-titulo", type: "text", maxlength: 160 });
    const campoCorpo = h("textarea", { id: "top-corpo", rows: 6, maxlength: 4000 });
    const campoNota = h("select", { id: "top-nota" }, h("option", { value: "" }, "Nenhuma"),
      notas.map((n) => h("option", { value: n.id }, `${n.title} — ${n.ownerName}`)));
    abrirDialogo({
      titulo: "Novo tópico",
      descricao: "Pergunte ou proponha uma discussão para a classe.",
      conteudo: [
        h("div", { class: "campo" }, h("label", { for: "top-titulo" }, "Título"), campoTitulo),
        h("div", { class: "campo" }, h("label", { for: "top-corpo" }, "Mensagem"), campoCorpo),
        h("div", { class: "campo" }, h("label", { for: "top-nota" }, "Nota relacionada (opcional)"), campoNota),
      ],
      confirmar: "Publicar tópico",
      aoConfirmar: async () => {
        if (!campoTitulo.value.trim() || !campoCorpo.value.trim()) throw new Error("Preencha o título e a mensagem.");
        const r = await api.post(`${base}/forum/topics`, {
          title: campoTitulo.value, body: campoCorpo.value, noteId: campoNota.value || null,
        });
        toast("Tópico publicado.", { tipo: "sucesso" });
        await navegar(`${rota}?topico=${enc(r.topic.id)}`);
      },
    });
  }
  const botaoNovo = h("button", { class: "btn", type: "button" }, "Novo tópico");
  botaoNovo.addEventListener("click", () => void novoTopico());

  // ---- lista de tópicos ----
  const itens = lista.length
    ? lista.map((t) => h("li", {},
      h("a", { class: "item-topico", href: `${rota}?topico=${enc(t.id)}`, "aria-current": t.id === idAberto ? "true" : null },
        h("strong", {}, t.title),
        h("span", {}, [t.authorName, plural(t.postCount, "resposta", "respostas"), tempoRelativo(t.createdAt)].filter(Boolean).join(" · ")))))
    : [h("li", { class: "texto-suave" }, "Ainda não há tópicos. Comece a primeira discussão.")];
  const colunaLista = h("section", { class: "forum-lista", "aria-label": "Tópicos" },
    h("div", { class: "cabecalho-secao" }, h("h2", {}, "Tópicos"), botaoNovo),
    h("ul", { class: "lista-topicos" }, itens));

  // ---- tópico aberto ----
  let detalhe = h("section", { class: "forum-detalhe forum-vazio" },
    h("p", { class: "texto-suave" }, "Escolha um tópico para ler e responder."));
  if (idAberto) {
    try {
      const r = await api.get(`${base}/forum/topics/${enc(idAberto)}/posts?limit=100`);
      const t = r.topic;
      const podeExcluir = (autorId) => autorId === user.id || souResponsavel;
      const acoesTopico = h("div", { class: "forum-acoes" },
        h("button", { class: "btn-texto", type: "button", "data-a": "den" }, "Denunciar"),
        podeExcluir(t.authorId) ? h("button", { class: "btn-texto", type: "button", "data-a": "exc" }, "Excluir tópico") : null);
      acoesTopico.querySelector("[data-a=den]").addEventListener("click", () => abrirDenuncia({ api, classId, tipoAlvo: "topic", idAlvo: t.id, toast }));
      acoesTopico.querySelector("[data-a=exc]")?.addEventListener("click", () => abrirDialogo({
        titulo: "Excluir tópico?", descricao: "As respostas também serão removidas.", confirmar: "Excluir", perigo: true,
        aoConfirmar: async () => {
          await api.delete(`${base}/forum/topics/${enc(t.id)}`);
          toast("Tópico excluído.");
          await navegar(rota);
        },
      }));

      const posts = r.posts.map((p) => {
        const li = h("li", { class: "post" },
          h("div", { class: "post-topo" }, h("strong", {}, p.authorName), h("span", { class: "texto-suave" }, tempoRelativo(p.createdAt))),
          h("p", { class: "post-corpo" }, p.body),
          h("div", { class: "forum-acoes" },
            h("button", { class: "btn-texto", type: "button", "data-a": "den" }, "Denunciar"),
            podeExcluir(p.authorId) ? h("button", { class: "btn-texto", type: "button", "data-a": "exc" }, "Excluir") : null));
        li.querySelector("[data-a=den]").addEventListener("click", () => abrirDenuncia({ api, classId, tipoAlvo: "post", idAlvo: p.id, toast }));
        li.querySelector("[data-a=exc]")?.addEventListener("click", () => abrirDialogo({
          titulo: "Excluir resposta?", confirmar: "Excluir", perigo: true,
          aoConfirmar: async () => {
            await api.delete(`${base}/forum/topics/${enc(t.id)}/posts/${enc(p.id)}`);
            toast("Resposta excluída.");
            await navegar(`${rota}?topico=${enc(t.id)}`);
          },
        }));
        return li;
      });

      const resposta = h("textarea", { id: "forum-resposta", rows: 3, maxlength: 4000, "aria-label": "Sua resposta", placeholder: "Escreva sua resposta…" });
      const enviar = h("button", { class: "btn", type: "submit" }, "Responder");
      const formulario = h("form", { class: "forum-form" }, resposta, enviar);
      formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (!resposta.value.trim()) return;
        enviar.disabled = true;
        try {
          await api.post(`${base}/forum/topics/${enc(t.id)}/posts`, { body: resposta.value });
          toast("Resposta publicada.", { tipo: "sucesso" });
          await navegar(`${rota}?topico=${enc(t.id)}`);
        } catch (erro) { falhar(erro); enviar.disabled = false; }
      });

      detalhe = h("section", { class: "forum-detalhe", "aria-label": "Tópico" },
        h("a", { class: "forum-voltar", href: rota }, "‹ Tópicos"),
        h("h2", {}, t.title),
        h("p", { class: "texto-suave" }, `${t.authorName} · ${tempoRelativo(t.createdAt)}`),
        h("p", { class: "post-corpo" }, t.body),
        t.noteId && t.noteBranchId
          ? h("a", { class: "pilula", href: `/classes/${enc(classId)}/notas/${enc(t.noteId)}` }, `Nota relacionada: ${t.noteTitle}`) : null,
        acoesTopico,
        h("h3", {}, plural(posts.length, "resposta", "respostas")),
        posts.length ? h("ul", { class: "lista-posts" }, posts) : h("p", { class: "texto-suave" }, "Ainda não há respostas."),
        formulario);
    } catch (erro) {
      detalhe = h("section", { class: "forum-detalhe" },
        h("p", { class: "aviso aviso-erro", role: "alert" }, mensagemDeErro(erro.codigo)),
        h("a", { class: "btn btn-secundario", href: rota }, "Voltar aos tópicos"));
    }
  }

  return h("section", { class: `forum${idAberto ? " forum-com-topico" : ""}` },
    cabecalhoClasse(detalhes.class, "forum", { alunos: detalhes.members.length }),
    h("div", { class: "forum-grade" },
      h("div", { class: "forum-coluna" }, colunaLista, cartaoRegras),
      detalhe));
}

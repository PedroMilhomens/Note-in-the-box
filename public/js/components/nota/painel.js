import { h, svg } from "../dom.js";
import { tempoRelativo } from "../../format.js";

const enc = encodeURIComponent;

function encurtar(texto, max) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

// Grafo de vizinhança da nota: raiz no centro e vizinhas em círculo (mesma lógica do legado).
function desenharGrafo(grafo, abrir) {
  const vizinhas = grafo.nodes.filter((no) => !no.isRoot);
  const centro = { x: 200, y: 140 };
  const posicoes = new Map([[grafo.rootNoteId, centro]]);
  vizinhas.forEach((no, indice) => {
    const angulo = (2 * Math.PI * indice) / Math.max(vizinhas.length, 1) - Math.PI / 2;
    posicoes.set(no.id, { x: centro.x + Math.cos(angulo) * 95, y: centro.y + Math.sin(angulo) * 85 });
  });
  const raiz = svg("svg", {
    class: "grafo", viewBox: "0 0 400 280", role: "group", "aria-label": "Rede de notas ligadas a esta nota",
  });
  for (const aresta of grafo.edges) {
    const de = posicoes.get(aresta.fromNoteId);
    const para = posicoes.get(aresta.toNoteId);
    if (de && para) raiz.append(svg("line", { class: "grafo-aresta", x1: de.x, y1: de.y, x2: para.x, y2: para.y }));
  }
  for (const no of grafo.nodes) {
    const p = posicoes.get(no.id);
    if (!p) continue;
    const grupo = svg("g", {
      class: no.isRoot ? "grafo-no grafo-raiz" : "grafo-no", role: "button", tabindex: "0",
      "aria-label": `${no.title}, ${no.ownerName}`,
    },
    svg("circle", { cx: p.x, cy: p.y, r: no.isRoot ? 18 : 13 }),
    svg("text", { x: p.x, y: p.y + (no.isRoot ? 34 : 28), "text-anchor": "middle" }, encurtar(no.title, 22)),
    svg("title", {}, `${no.title} — ${no.ownerName}`));
    grupo.addEventListener("click", () => abrir(no.id));
    grupo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); abrir(no.id); }
    });
    raiz.append(grupo);
  }
  return raiz;
}

// Painel lateral: outras branches, notas ligadas, rede, comentários, anexos e denúncia.
// acoes: { abrirNota, comentar, excluirComentario, anexar, removerAnexo, denunciar, removerReferencia }
export function criarPainel({ classId, userId, acoes }) {
  const secaoBranches = h("section", { class: "painel-secao", "aria-labelledby": "pn-branches" });
  const secaoLigadas = h("section", { class: "painel-secao", "aria-labelledby": "pn-ligadas" });
  const secaoComentarios = h("section", { class: "painel-secao", "aria-labelledby": "pn-comentarios" });
  const secaoAnexos = h("section", { class: "painel-secao", "aria-labelledby": "pn-anexos" });
  const aviso = h("p", { class: "texto-suave painel-aviso", hidden: true });

  const campoComentario = h("textarea", {
    id: "pn-novo-comentario", rows: 2, maxlength: 2000, placeholder: "Escreva um comentário…", "aria-label": "Novo comentário",
  });
  const formComentario = h("form", { class: "form-comentario" }, campoComentario,
    h("button", { class: "btn", type: "submit" }, "Comentar"));
  formComentario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = campoComentario.value.trim();
    if (!texto) return;
    if (await acoes.comentar(texto)) campoComentario.value = "";
  });

  const entrada = h("input", { type: "file", id: "pn-anexo", class: "sr-only", tabindex: "-1" });
  const botaoAnexo = h("label", { class: "btn btn-secundario", for: "pn-anexo" }, "Anexar arquivo");
  entrada.addEventListener("change", async () => {
    const [arquivo] = entrada.files;
    if (arquivo) await acoes.anexar(arquivo);
    entrada.value = "";
  });

  const raiz = h("aside", { class: "painel-nota", "aria-label": "Conexões e comentários" },
    aviso, secaoBranches, secaoLigadas, secaoComentarios, secaoAnexos);

  function atualizar(dados) {
    const {
      branchesOutras = [], referencias = [], grafo = null, comentarios = [], anexos = [],
      ehDono = false, semConexao = false, nota,
    } = dados;
    aviso.hidden = !semConexao;
    aviso.textContent = semConexao ? "Sem conexão: comentários, referências e anexos ficam indisponíveis." : "";

    secaoBranches.replaceChildren(
      h("h2", { id: "pn-branches", class: "lateral-titulo" }, "Ver outra branch"),
      branchesOutras.length
        ? h("ul", { class: "chips" }, branchesOutras.slice(0, 8).map((b) => h("li", {},
          h("a", { class: "pilula", href: `/classes/${enc(classId)}?branch=${enc(b.id)}` }, b.ownerName))))
        : h("p", { class: "texto-suave" }, "Ninguém mais na classe ainda."));

    secaoLigadas.replaceChildren(
      h("h2", { id: "pn-ligadas", class: "lateral-titulo" }, "Ligada a esta nota"),
      referencias.length
        ? h("ul", { class: "lista-ligadas" }, referencias.map((r) => h("li", {},
          h("button", { class: "ligada", type: "button" }, h("strong", {}, r.title), h("span", {}, r.ownerName)),
          ehDono ? h("button", { class: "btn-texto", type: "button", "aria-label": `Remover referência a ${r.title}` }, "Remover") : null)))
        : h("p", { class: "texto-suave" }, semConexao ? "—" : "Nenhuma referência ainda."),
      ...(grafo && grafo.nodes.length > 1 ? [desenharGrafo(grafo, acoes.abrirNota)] : []));
    secaoLigadas.querySelectorAll(".lista-ligadas li").forEach((li, indice) => {
      const ref = referencias[indice];
      li.querySelector(".ligada").addEventListener("click", () => acoes.abrirNota(ref.noteId));
      li.querySelector(".btn-texto")?.addEventListener("click", () => acoes.removerReferencia(ref));
    });

    const itensComentario = comentarios.map((c) => {
      const podeExcluir = c.authorId === userId || ehDono;
      const li = h("li", { class: "comentario" },
        h("div", { class: "comentario-topo" }, h("strong", {}, c.authorName), h("span", { class: "texto-suave" }, tempoRelativo(c.createdAt))),
        h("p", {}, c.body),
        h("div", { class: "comentario-acoes" },
          podeExcluir ? h("button", { class: "btn-texto", type: "button", "data-acao": "excluir" }, "Excluir") : null,
          h("button", { class: "btn-texto", type: "button", "data-acao": "denunciar" }, "Denunciar")));
      li.querySelector("[data-acao=excluir]")?.addEventListener("click", () => acoes.excluirComentario(c));
      li.querySelector("[data-acao=denunciar]").addEventListener("click", () => acoes.denunciar("comment", c.id));
      return li;
    });
    secaoComentarios.replaceChildren(
      h("h2", { id: "pn-comentarios", class: "lateral-titulo" }, "Comentários"),
      itensComentario.length ? h("ul", { class: "lista-comentarios" }, itensComentario)
        : h("p", { class: "texto-suave" }, semConexao ? "—" : "Nenhum comentário ainda."),
      ...(semConexao ? [] : [formComentario]));

    const itensAnexo = anexos.map((a) => {
      const li = h("li", {},
        h("a", {
          class: "anexo", href: `/api/classes/${enc(classId)}/attachments/${enc(a.id)}/download`, download: a.filename,
        }, `${a.filename} · ${Math.max(1, Math.ceil(a.sizeBytes / 1024))} KB`),
        ehDono ? h("button", { class: "btn-texto", type: "button" }, "Remover") : null);
      li.querySelector("button")?.addEventListener("click", () => acoes.removerAnexo(a));
      return li;
    });
    secaoAnexos.replaceChildren(
      h("h2", { id: "pn-anexos", class: "lateral-titulo" }, "Anexos"),
      itensAnexo.length ? h("ul", { class: "lista-anexos" }, itensAnexo) : h("p", { class: "texto-suave" }, semConexao ? "—" : "Nenhum anexo."),
      ...(ehDono && !semConexao ? [entrada, botaoAnexo] : []),
      ...(nota && !semConexao && !ehDono
        ? [h("button", { class: "btn-texto", type: "button", id: "pn-denunciar-nota" }, "Denunciar esta nota")] : []));
    secaoAnexos.querySelector("#pn-denunciar-nota")?.addEventListener("click", () => acoes.denunciar("note", nota.id));
  }

  atualizar({});
  return { raiz, atualizar };
}

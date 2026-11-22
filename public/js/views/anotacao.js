import { ehErroDeRede } from "../api.js";
import { mensagemDeErro } from "../auth-validation.js";
import { abrirDialogo } from "../components/nota/dialogo.js";
import { renderCorpo } from "../components/nota/corpo-view.js";
import { criarPainel } from "../components/nota/painel.js";
import { h } from "../components/dom.js";
import { ROTULO_STATUS, dataCurta } from "../format.js";
import { aplicarMarcacao } from "../nota/corpo.js";
import {
  estadoDaNota, isLocalNote, mesclarNotasLocais, mutacaoDeNota, notaVazia, novoIdLocal, registroOffline,
} from "../nota/modelo.js";
import {
  completeNoteMutation, deleteNoteMutation, deleteOfflineDraft, deleteOfflineNote, getOfflineDraft,
  getOfflineNote, listNoteMutations, listOfflineNotes, saveNoteMutation, saveOfflineBranchNotes,
  saveOfflineDraft, saveOfflineNote,
} from "../offline-store.js";
import { syncPendingNotes } from "../offline-sync.js";
import { getSessao } from "../store.js";

export const titulo = "Anotação";

const enc = encodeURIComponent;
const ESPERA_RASCUNHO_MS = 400;

function telaDeErro(mensagem, classId) {
  return h("section", { class: "anotacao-erro" },
    h("p", { class: "aviso aviso-erro", role: "alert" }, mensagem),
    h("a", { class: "btn", href: `/classes/${enc(classId)}` }, "Voltar para a classe"));
}

export async function render({ params, api, user, navegar, toast }) {
  const { classId } = params;
  const base = `/api/classes/${enc(classId)}`;
  const classeSessao = getSessao().classes.find((c) => c.id === classId);

  // Dados da classe (nome e branches). Sem rede, usa o que a sessão já conhece.
  let detalhes = null;
  try {
    detalhes = await api.get(`${base}?limit=100`);
  } catch (erro) {
    if (!ehErroDeRede(erro)) return telaDeErro(mensagemDeErro(erro.codigo), classId);
  }
  const classe = detalhes?.class ?? { id: classId, name: classeSessao?.name ?? "Classe" };
  const propria = detalhes?.branches.find((b) => b.ownerId === user.id);
  const idBranchPropria = propria?.id ?? classeSessao?.branchId ?? null;
  const primeiroNome = (user.name ?? "").split(/\s+/)[0] || "você";

  const S = {
    nota: null, serverNote: null, editavel: false, modo: "ler", conflito: null,
    salvando: false, sujo: false, sincronizando: false, notasBranch: [], semConexao: !navigator.onLine,
  };
  const contexto = () => ({ user: { id: user.id, name: user.name }, classId, branchId: S.nota.branchId });
  const urlDaNota = (id) => `/classes/${enc(classId)}/notas/${enc(id)}`;

  // ------- carga da nota -------
  async function carregarNota(idPedido) {
    let nota = null;
    let doServidor = null;
    if (idPedido === "nova") {
      if (!idBranchPropria) return telaDeErro("Você ainda não tem uma branch nesta classe.", classId);
      nota = notaVazia({ user, classId, branchId: idBranchPropria }, novoIdLocal());
      history.replaceState(history.state, "", urlDaNota(nota.id));
    } else if (isLocalNote(idPedido)) {
      nota = await getOfflineNote(user.id, classId, idPedido);
      nota ??= notaVazia({ user, classId, branchId: idBranchPropria }, idPedido);
    } else {
      try {
        ({ note: doServidor } = await api.get(`${base}/notes/${enc(idPedido)}`));
        nota = { ...doServidor };
        S.semConexao = false;
      } catch (erro) {
        if (!ehErroDeRede(erro)) return telaDeErro(mensagemDeErro(erro.codigo), classId);
        S.semConexao = true;
        nota = await getOfflineNote(user.id, classId, idPedido);
        if (!nota) return telaDeErro("Esta nota não está disponível sem conexão.", classId);
      }
    }
    S.serverNote = doServidor;
    const mutacao = (await listNoteMutations(user.id, classId)).find((m) => m.noteId === nota.id);
    if (mutacao) {
      nota = { ...nota, ...mutacao.fields, baseUpdatedAt: mutacao.baseUpdatedAt, pending: true };
      if (mutacao.conflict) S.conflito = mutacao;
    }
    const rascunho = await getOfflineDraft(user.id, classId, nota.branchId, nota.id);
    if (rascunho) {
      if (doServidor && rascunho.baseUpdatedAt && doServidor.updatedAt !== rascunho.baseUpdatedAt) {
        const conflito = mutacaoDeNota({ user, classId, branchId: nota.branchId }, "update", nota.id, rascunho.fields, rascunho.baseUpdatedAt);
        conflito.conflict = doServidor;
        await saveNoteMutation(conflito);
        await deleteOfflineDraft(user.id, classId, nota.branchId, nota.id);
        S.conflito = conflito;
      }
      nota = { ...nota, ...rascunho.fields, baseUpdatedAt: rascunho.baseUpdatedAt };
    }
    S.nota = nota;
    S.editavel = (nota.ownerId ?? user.id) === user.id;
    S.modo = S.editavel && !nota.body ? "escrever" : "ler";
    return null;
  }

  const falha = await carregarNota(params.noteId);
  if (falha) return falha;

  // ------- elementos -------
  const campoTitulo = h("input", {
    id: "nota-titulo", class: "nota-titulo", type: "text", maxlength: 160, placeholder: "Título da anotação",
    "aria-label": "Título da anotação", autocomplete: "off",
  });
  const campoData = h("input", { id: "nota-data", type: "date" });
  const campoEstado = h("select", { id: "nota-estado" },
    Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => h("option", { value: valor }, rotulo)));
  const campoCorpo = h("textarea", {
    id: "nota-corpo", class: "nota-corpo-editor", rows: 14, maxlength: 20000,
    placeholder: "Escreva aqui. Use **negrito**, _itálico_, “- ” para listas e [[título]] para referenciar outra nota.",
    "aria-label": "Texto da anotação",
  });
  const previa = h("div", { class: "nota-previa" });
  const estadoSalvo = h("span", { class: "pilula", role: "status" });
  const rede = h("span", { class: "pilula", role: "status" });
  const botaoPublicar = h("button", { class: "btn", type: "button" }, "Publicar na branch");
  const painelConflito = h("section", { class: "aviso aviso-erro nota-conflito", role: "alert", hidden: true });
  const listaNotas = h("ul", { class: "lista-notas-branch" });
  const botaoModo = h("button", { class: "barra-btn barra-modo", type: "button", "aria-pressed": "false" });
  let raiz = null;

  function lerCampos() {
    return {
      title: campoTitulo.value.trim(),
      body: campoCorpo.value,
      lessonDate: campoData.value || null,
      status: campoEstado.value,
    };
  }
  function preencher(nota) {
    campoTitulo.value = nota.title ?? "";
    campoCorpo.value = nota.body ?? "";
    campoData.value = nota.lessonDate ?? "";
    campoEstado.value = nota.status ?? "draft";
  }
  function atualizarEstado(texto) {
    const marca = S.conflito ? "Conflito" : S.sujo ? "Alterações não salvas" : estadoDaNota({ pending: S.nota.pending });
    estadoSalvo.textContent = texto ?? (marca || (isLocalNote(S.nota.id) ? "Rascunho local" : "Salvo"));
    rede.textContent = S.semConexao ? "Offline" : "Sincronizado";
    rede.classList.toggle("pilula-alerta", S.semConexao);
  }

  // ------- painel lateral -------
  let notasPorTitulo = new Map();
  const outrasBranches = () => (detalhes?.branches ?? []).filter((b) => b.ownerId !== S.nota.ownerId);
  const falhar = (erro) => toast(erro.message, { tipo: "erro" });
  const painel = criarPainel({
    classId, userId: user.id,
    acoes: {
      abrirNota: (id) => navegar(urlDaNota(id)),
      comentar: async (texto) => {
        try {
          await api.post(`${base}/notes/${enc(S.nota.id)}/comments`, { body: texto });
          await carregarColaboracao();
          return true;
        } catch (erro) { falhar(erro); return false; }
      },
      excluirComentario: async (comentario) => {
        try {
          await api.delete(`${base}/notes/${enc(S.nota.id)}/comments/${enc(comentario.id)}`);
          await carregarColaboracao();
        } catch (erro) { falhar(erro); }
      },
      anexar: async (arquivo) => {
        try {
          await api.upload(`${base}/notes/${enc(S.nota.id)}/attachments`, arquivo, {
            "content-type": arquivo.type || "application/octet-stream",
            "x-file-name": enc(arquivo.name),
          });
          await carregarColaboracao();
          toast("Anexo enviado.", { tipo: "sucesso" });
        } catch (erro) { falhar(erro); }
      },
      removerAnexo: async (anexo) => {
        try {
          await api.delete(`${base}/attachments/${enc(anexo.id)}`);
          await carregarColaboracao();
        } catch (erro) { falhar(erro); }
      },
      removerReferencia: async (referencia) => {
        try {
          await api.delete(`${base}/notes/${enc(S.nota.id)}/references/${enc(referencia.noteId)}`);
          await carregarColaboracao();
        } catch (erro) { falhar(erro); }
      },
      denunciar: (tipoAlvo, idAlvo) => abrirDenuncia(tipoAlvo, idAlvo),
    },
  });

  async function carregarColaboracao() {
    if (S.semConexao || isLocalNote(S.nota.id)) {
      painel.atualizar({ semConexao: true, ehDono: false, nota: S.nota, branchesOutras: outrasBranches() });
      return;
    }
    try {
      const idn = enc(S.nota.id);
      const [refs, grafo, comentarios, anexos] = await Promise.all([
        api.get(`${base}/notes/${idn}/references?limit=100`),
        api.get(`${base}/graph?noteId=${idn}&limit=20`),
        api.get(`${base}/notes/${idn}/comments?limit=100`),
        api.get(`${base}/notes/${idn}/attachments`),
      ]);
      painel.atualizar({
        branchesOutras: outrasBranches(),
        referencias: refs.references, grafo, comentarios: comentarios.comments, anexos: anexos.attachments,
        ehDono: S.editavel, nota: S.nota,
      });
    } catch (erro) {
      if (ehErroDeRede(erro)) {
        S.semConexao = true;
        atualizarEstado();
        painel.atualizar({ semConexao: true, nota: S.nota, branchesOutras: outrasBranches() });
      } else falhar(erro);
    }
  }

  // ------- lista de notas da branch -------
  async function carregarListaBranch() {
    const idBranch = S.nota.branchId;
    const propriaBranch = idBranch === idBranchPropria;
    let notas = [];
    try {
      ({ notes: notas } = await api.get(`${base}/branches/${enc(idBranch)}/notes?limit=100`));
      if (propriaBranch) {
        const [mutacoes, locais] = await Promise.all([
          listNoteMutations(user.id, classId), listOfflineNotes(user.id, classId, idBranch),
        ]);
        const doServidor = notas;
        notas = mesclarNotasLocais(notas, mutacoes, locais.filter((n) => isLocalNote(n.id)));
        await saveOfflineBranchNotes({
          userId: user.id, userName: user.name, classId, branchId: idBranch,
          notes: doServidor.filter((n) => !mutacoes.some((m) => m.noteId === n.id)),
        }).catch(() => {});
      }
    } catch (erro) {
      if (!ehErroDeRede(erro)) { falhar(erro); return; }
      S.semConexao = true;
      notas = propriaBranch ? await listOfflineNotes(user.id, classId, idBranch) : [];
    }
    S.notasBranch = notas;
    notasPorTitulo = new Map(notas.map((n) => [String(n.title ?? "").toLocaleLowerCase("pt-BR"), n]));
    desenharLista();
    desenharPrevia();
  }

  function desenharLista() {
    listaNotas.replaceChildren(...S.notasBranch.map((n) => h("li", {},
      h("a", { class: "item-nota", href: urlDaNota(n.id), "aria-current": n.id === S.nota.id ? "page" : null },
        h("strong", {}, n.title || "Sem título"),
        h("span", {}, [n.lessonDate ? dataCurta(n.lessonDate) : null, estadoDaNota(n)].filter(Boolean).join(" · "))))));
    if (!S.notasBranch.length) listaNotas.append(h("li", { class: "texto-suave" }, "Nenhuma anotação nesta branch."));
  }

  function desenharPrevia() {
    previa.replaceChildren(renderCorpo(campoCorpo.value, { notasPorTitulo, hrefDe: (alvo) => urlDaNota(alvo.id) }));
  }

  // ------- rascunho local -------
  let temporizador = null;
  async function guardarRascunho() {
    temporizador = null;
    if (!S.editavel || !S.sujo) return;
    try {
      await saveOfflineDraft({
        noteId: S.nota.id, userId: user.id, userName: user.name, classId, branchId: S.nota.branchId,
        baseUpdatedAt: isLocalNote(S.nota.id) ? null : (S.nota.baseUpdatedAt ?? S.nota.updatedAt ?? null),
        fields: lerCampos(),
      });
      atualizarEstado("Rascunho guardado");
    } catch { atualizarEstado("Não foi possível guardar o rascunho"); }
  }
  function marcarSujo() {
    if (!S.editavel) return;
    S.sujo = true;
    atualizarEstado();
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarRascunho, ESPERA_RASCUNHO_MS);
  }
  function descarregarRascunho() {
    clearTimeout(temporizador);
    void guardarRascunho();
  }
  for (const campo of [campoTitulo, campoData, campoEstado, campoCorpo]) {
    campo.addEventListener("input", () => { marcarSujo(); if (campo === campoCorpo) desenharPrevia(); });
    campo.addEventListener("change", marcarSujo);
  }
  const ouvintes = [
    [document, "visibilitychange", () => { if (document.visibilityState === "hidden") descarregarRascunho(); }],
    [window, "online", () => { S.semConexao = false; atualizarEstado(); void sincronizar({ silencioso: true }); }],
    [window, "offline", () => { S.semConexao = true; atualizarEstado(); }],
    [document, "keydown", (evento) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s") { evento.preventDefault(); void salvar(); }
    }],
  ];
  // A tela não tem gancho de desmontagem: os ouvintes globais se removem quando a raiz sai do documento.
  for (const [alvo, tipo, funcao] of ouvintes) {
    const envolvido = (evento) => {
      if (raiz && !raiz.isConnected) { alvo.removeEventListener(tipo, envolvido); return; }
      funcao(evento);
    };
    alvo.addEventListener(tipo, envolvido);
  }

  // ------- salvar -------
  async function salvar({ publicar = false } = {}) {
    if (!S.editavel || S.salvando) return;
    if (publicar && campoEstado.value === "draft") campoEstado.value = "complete";
    const campos = lerCampos();
    if (!campos.title) { toast("Dê um título à anotação antes de salvar.", { tipo: "erro" }); campoTitulo.focus(); return; }
    clearTimeout(temporizador);
    S.salvando = true;
    botaoPublicar.disabled = true;
    const ctx = contexto();
    const criar = isLocalNote(S.nota.id);
    const baseUpdatedAt = criar ? null : (S.nota.baseUpdatedAt ?? S.nota.updatedAt ?? null);
    const mutacao = mutacaoDeNota(ctx, criar ? "create" : "update", S.nota.id, campos, baseUpdatedAt);

    const manterLocal = async (conflito = null) => {
      mutacao.conflict = conflito;
      const registro = registroOffline(ctx, S.nota.id, campos, { baseUpdatedAt, pending: true });
      await saveNoteMutation(mutacao);
      await saveOfflineNote(registro);
      await deleteOfflineDraft(user.id, classId, ctx.branchId, S.nota.id);
      S.nota = { ...registro, baseUpdatedAt };
      S.sujo = false;
      if (conflito) { S.conflito = mutacao; desenharConflito(); }
    };

    try {
      const caminho = criar ? `${base}/branches/${enc(ctx.branchId)}/notes` : `${base}/notes/${enc(S.nota.id)}`;
      const corpo = criar ? { ...campos, clientId: mutacao.clientId } : { ...campos, baseUpdatedAt };
      const { note } = await (criar ? api.post(caminho, corpo) : api.patch(caminho, corpo));
      const idAntigo = S.nota.id;
      await completeNoteMutation(mutacao, note);
      S.nota = { ...note, ownerId: user.id, ownerName: user.name, baseUpdatedAt: note.updatedAt, pending: false };
      S.sujo = false;
      S.semConexao = false;
      if (idAntigo !== note.id) history.replaceState(history.state, "", urlDaNota(note.id));
      atualizarEstado("Salvo");
      toast(publicar ? "Anotação publicada na sua branch." : "Anotação salva.", { tipo: "sucesso" });
      await Promise.all([carregarListaBranch(), carregarColaboracao()]);
    } catch (erro) {
      try {
        if (erro.status === 409 && erro.payload?.codigo === "CONFLITO_NOTA") {
          await manterLocal(erro.payload.note);
          toast("Sua versão foi preservada neste dispositivo. Escolha como resolver o conflito.", { tipo: "erro" });
        } else if (ehErroDeRede(erro)) {
          S.semConexao = true;
          await manterLocal();
          atualizarEstado("Salvo neste dispositivo, aguardando sincronização");
          toast("Sem conexão: anotação salva neste dispositivo e aguardando sincronização.");
          await carregarListaBranch();
        } else {
          falhar(erro);
        }
      } catch (armazenamento) {
        falhar(armazenamento);
      }
    } finally {
      S.salvando = false;
      botaoPublicar.disabled = false;
      if (estadoSalvo.textContent.startsWith("Salvo neste")) rede.textContent = "Offline";
      else atualizarEstado();
    }
  }

  // ------- conflito -------
  async function descartarConflito(mutacao, servidor) {
    await Promise.all([
      saveOfflineNote({ ...servidor, userId: user.id, userName: user.name, classId, branchId: mutacao.branchId }),
      deleteNoteMutation(mutacao.key),
      deleteOfflineDraft(user.id, classId, mutacao.branchId, mutacao.noteId),
      ...(isLocalNote(mutacao.noteId) ? [deleteOfflineNote(user.id, classId, mutacao.noteId)] : []),
    ]);
  }
  function desenharConflito() {
    painelConflito.hidden = !S.conflito;
    if (!S.conflito) return;
    const servidor = S.conflito.conflict;
    const usarServidor = h("button", { class: "btn btn-secundario", type: "button" }, "Usar versão do servidor");
    const guardarCopia = h("button", { class: "btn", type: "button" }, "Salvar minha versão como nova nota");
    usarServidor.addEventListener("click", async () => {
      try {
        await descartarConflito(S.conflito, servidor);
        S.conflito = null;
        S.nota = { ...servidor, ownerId: user.id, ownerName: user.name, baseUpdatedAt: servidor.updatedAt, pending: false };
        preencher(S.nota);
        desenharPrevia();
        desenharConflito();
        atualizarEstado("Versão do servidor carregada");
        await carregarListaBranch();
      } catch (erro) { falhar(erro); }
    });
    guardarCopia.addEventListener("click", async () => {
      try {
        const mutacao = S.conflito;
        const novoId = novoIdLocal();
        const ctx = { user: { id: user.id, name: user.name }, classId, branchId: mutacao.branchId };
        await descartarConflito(mutacao, servidor);
        await saveOfflineNote(registroOffline(ctx, novoId, mutacao.fields, { pending: true }));
        await saveNoteMutation(mutacaoDeNota(ctx, "create", novoId, mutacao.fields));
        S.conflito = null;
        desenharConflito();
        toast("Sua versão foi preservada como uma nova nota pendente.");
        await navegar(urlDaNota(novoId));
      } catch (erro) { falhar(erro); }
    });
    painelConflito.replaceChildren(
      h("h2", {}, "Esta nota mudou no servidor"),
      h("p", {}, `Há uma versão mais nova${servidor?.updatedAt ? ` (${dataCurta(servidor.updatedAt)})` : ""}. Sua versão continua guardada neste dispositivo.`),
      h("div", { class: "dialogo-acoes" }, usarServidor, guardarCopia));
  }

  // ------- sincronização -------
  async function sincronizar({ silencioso = false } = {}) {
    if (S.sincronizando || !navigator.onLine) return;
    S.sincronizando = true;
    try {
      const resultado = await syncPendingNotes(user.id, (caminho, { method, body }) => api.request(method, caminho, JSON.parse(body)));
      if (resultado.synced.length && !silencioso) toast(`${resultado.synced.length} anotação(ões) sincronizada(s).`, { tipo: "sucesso" });
      if (resultado.conflicts.length) toast("Há anotações com conflito para resolver.", { tipo: "erro" });
      S.semConexao = resultado.interrupted;
      const trocada = resultado.synced.find((s) => s.localNoteId === S.nota.id);
      if (trocada) {
        S.nota = { ...trocada.note, ownerId: user.id, ownerName: user.name, baseUpdatedAt: trocada.note.updatedAt, pending: false };
        history.replaceState(history.state, "", urlDaNota(trocada.note.id));
      }
      await Promise.all([carregarListaBranch(), carregarColaboracao()]);
    } catch (erro) {
      if (!silencioso) falhar(erro);
    } finally {
      S.sincronizando = false;
      atualizarEstado();
    }
  }

  // ------- diálogos -------
  async function abrirReferencia() {
    if (!S.editavel || S.semConexao || isLocalNote(S.nota.id)) {
      toast("Salve a anotação e conecte-se à internet para referenciar outra nota.", { tipo: "erro" });
      return;
    }
    let candidatos;
    try {
      ({ candidates: candidatos } = await api.get(`${base}/reference-candidates?noteId=${enc(S.nota.id)}&limit=100`));
    } catch (erro) { falhar(erro); return; }
    if (!candidatos.length) { toast("Não há notas em outras branches para referenciar."); return; }
    const seletor = h("select", { id: "ref-alvo" },
      candidatos.map((c) => h("option", { value: c.id }, `${c.title} — ${c.ownerName}`)));
    abrirDialogo({
      titulo: "Referenciar nota",
      descricao: "Escolha uma nota de outra branch. Um atalho [[título]] entra no texto.",
      conteudo: [h("div", { class: "campo" }, h("label", { for: "ref-alvo" }, "Nota"), seletor)],
      confirmar: "Inserir referência",
      aoConfirmar: async () => {
        const alvo = candidatos.find((c) => c.id === seletor.value);
        await api.post(`${base}/notes/${enc(S.nota.id)}/references`, { targetNoteId: alvo.id });
        if (S.modo !== "escrever") alternarModo("escrever");
        campoCorpo.setRangeText(`[[${alvo.title}]]`, campoCorpo.selectionStart, campoCorpo.selectionEnd, "end");
        marcarSujo();
        desenharPrevia();
        await carregarColaboracao();
        toast("Referência inserida. Salve a anotação para registrar o texto.");
      },
    });
  }

  function abrirDenuncia(tipoAlvo, idAlvo) {
    const motivo = h("textarea", { id: "den-motivo", rows: 4, maxlength: 500 });
    abrirDialogo({
      titulo: "Denunciar conteúdo",
      conteudo: [h("div", { class: "campo" }, h("label", { for: "den-motivo" }, "Descreva o motivo"), motivo)],
      confirmar: "Enviar denúncia",
      aoConfirmar: async () => {
        const texto = motivo.value.trim();
        if (!texto) throw new Error("Descreva o motivo da denúncia.");
        await api.post(`${base}/reports`, { targetType: tipoAlvo, targetId: idAlvo, reason: texto });
        toast("Denúncia enviada.", { tipo: "sucesso" });
      },
    });
  }

  function abrirFlashcard() {
    const noEditor = !campoCorpo.hidden ? campoCorpo.value.slice(campoCorpo.selectionStart, campoCorpo.selectionEnd) : "";
    const selecionado = (noEditor || window.getSelection()?.toString() || "").trim();
    if (!selecionado) { toast("Selecione um trecho do texto para virar a resposta do flashcard.", { tipo: "erro" }); return; }
    if (isLocalNote(S.nota.id) || S.semConexao) { toast("Salve a anotação e conecte-se para criar flashcards.", { tipo: "erro" }); return; }
    const pergunta = h("input", { id: "fc-pergunta", type: "text", maxlength: 300 });
    abrirDialogo({
      titulo: "Criar flashcard",
      descricao: `Resposta: “${selecionado.length > 120 ? `${selecionado.slice(0, 117)}…` : selecionado}”`,
      conteudo: [h("div", { class: "campo" }, h("label", { for: "fc-pergunta" }, "Pergunta"), pergunta)],
      confirmar: "Criar flashcard",
      aoConfirmar: async () => {
        if (!pergunta.value.trim()) throw new Error("Escreva a pergunta do flashcard.");
        await api.post(`${base}/flashcards`, { question: pergunta.value, answer: selecionado, noteId: S.nota.id });
        toast("Flashcard criado. Ele já aparece na revisão.", { tipo: "sucesso" });
      },
    });
  }

  function excluirNota() {
    abrirDialogo({
      titulo: "Excluir anotação?",
      descricao: "Esta ação não pode ser desfeita.",
      confirmar: "Excluir",
      perigo: true,
      aoConfirmar: async () => {
        const idNota = S.nota.id;
        if (isLocalNote(idNota)) {
          await Promise.all([
            deleteOfflineNote(user.id, classId, idNota),
            deleteOfflineDraft(user.id, classId, S.nota.branchId, idNota),
            deleteNoteMutation(mutacaoDeNota(contexto(), "create", idNota, {}).key),
          ]);
        } else {
          await api.delete(`${base}/notes/${enc(idNota)}`);
          await deleteOfflineNote(user.id, classId, idNota).catch(() => {});
        }
        S.sujo = false;
        toast("Anotação excluída.");
        await navegar(`/classes/${enc(classId)}`);
      },
    });
  }

  // ------- barra de formatação -------
  function marcar(tipo) {
    if (!S.editavel) return;
    if (S.modo !== "escrever") alternarModo("escrever");
    const r = aplicarMarcacao(campoCorpo.value, campoCorpo.selectionStart, campoCorpo.selectionEnd, tipo);
    campoCorpo.value = r.texto;
    campoCorpo.focus();
    campoCorpo.setSelectionRange(r.inicio, r.fim);
    marcarSujo();
    desenharPrevia();
  }
  const botaoBarra = (rotulo, conteudo, aoClicar) => {
    const b = h("button", { class: "barra-btn", type: "button", "aria-label": rotulo, title: rotulo }, conteudo);
    b.addEventListener("click", aoClicar);
    return b;
  };
  const botoesEdicao = [
    botaoBarra("Negrito", h("strong", {}, "B"), () => marcar("negrito")),
    botaoBarra("Itálico", h("em", {}, "I"), () => marcar("italico")),
    botaoBarra("Lista", "Lista", () => marcar("lista")),
    botaoBarra("Referenciar nota", "Referenciar nota", () => void abrirReferencia()),
  ];
  const barra = h("div", { class: "barra-nota", role: "toolbar", "aria-label": "Formatação" },
    S.editavel ? botoesEdicao : null,
    botaoBarra("Criar flashcard a partir do texto selecionado", "Criar flashcard", abrirFlashcard),
    botaoModo);

  function alternarModo(modo) {
    S.modo = modo;
    const escrevendo = modo === "escrever" && S.editavel;
    campoCorpo.hidden = !escrevendo;
    previa.hidden = escrevendo;
    botaoModo.textContent = escrevendo ? "Ler" : "Escrever";
    botaoModo.hidden = !S.editavel;
    botaoModo.setAttribute("aria-pressed", String(escrevendo));
    if (!escrevendo) desenharPrevia();
  }
  botaoModo.addEventListener("click", () => alternarModo(S.modo === "escrever" ? "ler" : "escrever"));
  campoCorpo.addEventListener("keydown", (evento) => {
    if (evento.altKey && evento.shiftKey && evento.key.toLowerCase() === "r") { evento.preventDefault(); void abrirReferencia(); }
  });

  // ------- montagem -------
  preencher(S.nota);
  for (const c of [campoTitulo, campoData, campoEstado]) c.disabled = !S.editavel;
  campoCorpo.readOnly = !S.editavel;
  botaoPublicar.hidden = !S.editavel;
  botaoPublicar.addEventListener("click", () => void salvar({ publicar: true }));
  const botaoSalvar = h("button", { class: "btn btn-secundario", type: "button" }, "Salvar");
  botaoSalvar.hidden = !S.editavel;
  botaoSalvar.addEventListener("click", () => void salvar());
  const botaoExcluir = h("button", { class: "btn-texto", type: "button" }, "Excluir anotação");
  botaoExcluir.hidden = !S.editavel;
  botaoExcluir.addEventListener("click", excluirNota);
  const botaoSync = h("button", { class: "btn-texto", type: "button" }, "Sincronizar agora");
  botaoSync.addEventListener("click", () => void sincronizar());

  const nomeDono = S.editavel ? `Minha branch (${primeiroNome})` : `Branch de ${S.nota.ownerName ?? "colega"}`;
  const topo = h("header", { class: "anotacao-topo" },
    h("a", { class: "voltar", href: `/classes/${enc(classId)}`, "aria-label": `Voltar para ${classe.name}` }, "‹"),
    h("div", { class: "anotacao-caminho" }, h("strong", {}, classe.name), h("span", { class: "texto-suave" }, nomeDono)),
    h("div", { class: "anotacao-status" }, rede, estadoSalvo),
    botaoSalvar, botaoPublicar);

  const aviso = S.editavel ? null
    : h("p", { class: "aviso", role: "note" }, `Somente leitura: esta anotação é de ${S.nota.ownerName ?? "outro aluno"}. Você pode comentar e referenciar.`);

  const coluna = h("aside", { class: "anotacao-notas", "aria-label": "Notas da branch" },
    h("h2", { class: "lateral-titulo" }, "Notas da branch"),
    S.nota.branchId === idBranchPropria
      ? h("a", { class: "btn btn-secundario btn-bloco", href: `/classes/${enc(classId)}/notas/nova` }, "+ Nova anotação") : null,
    listaNotas,
    botaoSync);

  const papel = h("article", { class: "papel", "aria-label": "Anotação" },
    barra, campoTitulo,
    h("div", { class: "papel-meta" },
      h("label", { for: "nota-data" }, "Aula de"), campoData,
      h("label", { for: "nota-estado" }, "Estado"), campoEstado),
    campoCorpo, previa, botaoExcluir);

  raiz = h("div", { class: "anotacao" },
    topo, painelConflito, aviso,
    h("div", { class: "anotacao-grade" }, coluna, papel, painel.raiz));
  raiz.addEventListener("focusout", (evento) => {
    if (evento.target instanceof HTMLElement && evento.target.closest(".papel")) descarregarRascunho();
  });

  alternarModo(S.modo);
  desenharConflito();
  atualizarEstado();
  desenharLista();
  void Promise.all([carregarListaBranch(), carregarColaboracao()]).then(atualizarEstado);
  if (navigator.onLine) void sincronizar({ silencioso: true });
  return raiz;
}

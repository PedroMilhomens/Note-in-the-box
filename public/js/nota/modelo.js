// Modelo de nota e fila offline: funções puras usadas pela tela de anotação.
import { offlineNoteKey } from "../offline-store.js";

const PREFIXO_LOCAL = "local-";

export function isLocalNote(noteId) {
  return typeof noteId === "string" && noteId.startsWith(PREFIXO_LOCAL);
}

export function novoIdLocal(cripto = globalThis.crypto) {
  if (!cripto?.randomUUID) {
    throw new Error("Não é possível criar uma nota offline neste navegador.");
  }
  return `${PREFIXO_LOCAL}${cripto.randomUUID()}`;
}

export function clientIdDe(noteId) {
  return isLocalNote(noteId) ? noteId.slice(PREFIXO_LOCAL.length) : null;
}

// contexto = { user: { id, name }, classId, branchId }
export function mutacaoDeNota(contexto, tipo, noteId, campos, baseUpdatedAt = null, agora = Date.now()) {
  return {
    key: offlineNoteKey(contexto.user.id, contexto.classId, noteId),
    kind: tipo,
    noteId,
    userId: contexto.user.id,
    userName: contexto.user.name,
    classId: contexto.classId,
    branchId: contexto.branchId,
    clientId: tipo === "create" ? clientIdDe(noteId) : null,
    baseUpdatedAt,
    fields: campos,
    createdAt: agora,
    conflict: null,
  };
}

export function registroOffline(contexto, noteId, campos, { baseUpdatedAt = null, pending = false } = {}) {
  return {
    id: noteId,
    userId: contexto.user.id,
    userName: contexto.user.name,
    classId: contexto.classId,
    branchId: contexto.branchId,
    ownerId: contexto.user.id,
    ownerName: contexto.user.name,
    ...campos,
    updatedAt: baseUpdatedAt,
    pending,
  };
}

export function notaVazia(contexto, noteId) {
  return {
    id: noteId,
    branchId: contexto.branchId,
    ownerId: contexto.user.id,
    ownerName: contexto.user.name,
    title: "",
    body: "",
    lessonDate: null,
    status: "draft",
    updatedAt: null,
  };
}

// Mescla notas do servidor com mutações pendentes e rascunhos locais (lista da própria branch).
export function mesclarNotasLocais(notasServidor, mutacoes, notasLocais) {
  const pendentes = new Map(mutacoes.map((mutacao) => [mutacao.noteId, mutacao]));
  const idsServidor = new Set(notasServidor.map((nota) => nota.id));
  const notas = notasServidor.map((nota) => {
    const mutacao = pendentes.get(nota.id);
    return {
      ...nota,
      ...(mutacao ? mutacao.fields : {}),
      pending: Boolean(mutacao),
      conflict: mutacao?.conflict,
    };
  });
  for (const local of notasLocais) {
    if (!idsServidor.has(local.id)) notas.push(local);
  }
  return notas;
}

export function estadoDaNota(nota) {
  if (nota.conflict) return "Conflito";
  if (nota.pending) return "Pendente";
  if (nota.isDraft) return "Rascunho local";
  return "";
}

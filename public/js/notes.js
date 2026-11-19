import { syncPendingNotes } from "./offline-sync.js";
import {
  completeNoteMutation,
  clearOfflineData,
  deleteNoteMutation,
  deleteOfflineDraft,
  deleteOfflineNote,
  getOfflineDraft,
  getOfflineNote,
  getOfflineSession,
  listNoteMutations,
  listOfflineNotes,
  offlineNoteKey,
  offlineStorageAvailable,
  saveNoteMutation,
  saveOfflineBranchNotes,
  saveOfflineDraft,
  saveOfflineNote,
  saveOfflineSession,
} from "./offline-store.js";

const classSelect = document.querySelector("#class-select");
const branchSelect = document.querySelector("#branch-select");
const feedback = document.querySelector("#feedback");
const notesList = document.querySelector("#notes-list");
const missedList = document.querySelector("#missed-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#note-title");
const lessonDateInput = document.querySelector("#lesson-date");
const statusInput = document.querySelector("#note-status");
const bodyInput = document.querySelector("#note-body");
const preview = document.querySelector("#note-preview");
const newNoteButton = document.querySelector("#new-note");
const deleteNoteButton = document.querySelector("#delete-note");
const referenceButton = document.querySelector("#reference-note");
const referencesList = document.querySelector("#references-list");
const attachmentsList = document.querySelector("#attachments-list");
const attachmentForm = document.querySelector("#attachment-form");
const attachmentInput = document.querySelector("#attachment-file");
const uploadAttachmentButton = document.querySelector("#upload-attachment");
const commentsList = document.querySelector("#comments-list");
const commentForm = document.querySelector("#comment-form");
const commentBodyInput = document.querySelector("#comment-body");
const reportNoteButton = document.querySelector("#report-note");
const referenceDialog = document.querySelector("#reference-dialog");
const referenceSelect = document.querySelector("#reference-select");
const insertReferenceButton = document.querySelector("#insert-reference");
const noteGraph = document.querySelector("#note-graph");
const forumLink = document.querySelector("#forum-link");
const flashcardsLink = document.querySelector("#flashcards-link");
const pomodoroLink = document.querySelector("#pomodoro-link");
const selectedFlashcardForm = document.querySelector("#selected-flashcard-form");
const selectedFlashcardAnswer = document.querySelector("#selected-flashcard-answer");
const selectedFlashcardStatus = document.querySelector("#selected-flashcard-status");
const selectedFlashcardQuestion = document.querySelector("#selected-flashcard-question");
const createSelectedFlashcardButton = document.querySelector("#create-selected-flashcard");
const offlineStatus = document.querySelector("#offline-status");
const syncNowButton = document.querySelector("#sync-now");
const clearOfflineDataButton = document.querySelector("#clear-offline-data");
const conflictPanel = document.querySelector("#note-conflict");
const conflictMessage = document.querySelector("#conflict-message");
const serverNotePreview = document.querySelector("#server-note-preview");
const useServerVersionButton = document.querySelector("#use-server-version");
const saveLocalCopyButton = document.querySelector("#save-local-copy");

let currentUser = null;
let classes = [];
let currentClass = null;
let currentNote = null;
let canEdit = false;
let referenceCandidates = [];
let selectedFlashcardText = "";
let offlineMode = false;
let draftSaveTimer = null;
let activeConflict = null;
let syncInProgress = false;

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    const error = new Error(
      payload?.erro ?? "Não foi possível concluir a solicitação.",
    );
    error.status = response.status;
    error.code = payload?.codigo;
    error.payload = payload;
    throw error;
  }
  if (!payload) throw new Error("Resposta inválida do servidor.");
  return payload;
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function updateOfflineStatus(message, isError = false) {
  offlineStatus.textContent = message;
  offlineStatus.classList.toggle("error", isError);
  syncNowButton.disabled = !navigator.onLine || syncInProgress;
}

function isLocalNote(noteId) {
  return typeof noteId === "string" && noteId.startsWith("local-");
}

function localNoteId() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Não é possível criar uma nota offline neste navegador.");
  }
  return `local-${crypto.randomUUID()}`;
}

function currentNoteFields() {
  return {
    title: titleInput.value,
    lessonDate: lessonDateInput.value || null,
    status: statusInput.value,
    body: bodyInput.value,
  };
}

function offlineNoteRecord(noteId, fields, {
  baseUpdatedAt = null,
  pending = false,
} = {}) {
  return {
    id: noteId,
    userId: currentUser.id,
    userName: currentUser.name,
    classId: currentClass.id,
    branchId: branchSelect.value,
    ownerId: currentUser.id,
    ownerName: currentUser.name,
    ...fields,
    updatedAt: baseUpdatedAt,
    pending,
  };
}

function updateNetworkStatus() {
  if (!navigator.onLine) {
    updateOfflineStatus(
      "Sem conexão. Alterações salvas aqui ficam pendentes até você sincronizar.",
    );
  } else if (offlineMode) {
    updateOfflineStatus(
      "A conexão voltou. Sincronize as alterações para enviá-las ao servidor.",
    );
  } else {
    updateOfflineStatus(
      "Notas próprias e rascunhos podem ser armazenados neste dispositivo.",
    );
  }
}

async function saveCurrentDraft() {
  if (!currentUser || !currentClass || !currentNote || !canEdit) return;
  const isNew = isLocalNote(currentNote.id);
  const baseUpdatedAt = isNew
    ? null
    : currentNote.baseUpdatedAt ?? currentNote.updatedAt;
  await saveOfflineDraft({
    noteId: currentNote.id,
    userId: currentUser.id,
    userName: currentUser.name,
    classId: currentClass.id,
    branchId: branchSelect.value,
    baseUpdatedAt,
    fields: currentNoteFields(),
  });
  updateOfflineStatus("Rascunho guardado neste dispositivo.");
}

function scheduleDraftSave() {
  if (!currentNote || !canEdit || !currentUser || !currentClass) return;
  if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    void saveCurrentDraft().catch((error) => {
      updateOfflineStatus(error.message, true);
    });
  }, 400);
}

function updatePreview() {
  preview.textContent = bodyInput.value;
  selectedFlashcardText = "";
  selectedFlashcardAnswer.value = "";
  updateSelectedFlashcardStatus();
}

function updateSelectedFlashcard() {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";
  if (!selectedText) return;
  const isPreviewSelection = selection
    && selection.anchorNode
    && preview.contains(selection.anchorNode)
    && selection.focusNode
    && preview.contains(selection.focusNode);
  selectedFlashcardText = isPreviewSelection ? selectedText : "";
  selectedFlashcardAnswer.value = selectedFlashcardText;
  updateSelectedFlashcardStatus();
}

function updateSelectedFlashcardStatus() {
  const tooLong = selectedFlashcardText.length > selectedFlashcardAnswer.maxLength;
  createSelectedFlashcardButton.disabled = !currentClass
    || !currentNote
    || offlineMode
    || isLocalNote(currentNote.id)
    || !selectedFlashcardText
    || tooLong;
  selectedFlashcardStatus.textContent = tooLong
    ? "O trecho selecionado não pode exceder 20.000 caracteres."
    : selectedFlashcardText
      ? "Trecho selecionado. Preencha a pergunta para criar o cartão."
      : "Selecione um trecho na visualização de uma nota.";
}

function setEditable(editable) {
  canEdit = editable;
  for (const field of [titleInput, lessonDateInput, statusInput, bodyInput]) {
    field.disabled = !editable;
  }
  document.querySelector("#save-note").disabled = !editable;
  deleteNoteButton.hidden = !editable || !currentNote
    || offlineMode || isLocalNote(currentNote.id);
  newNoteButton.disabled = !editable;
  referenceButton.disabled = !editable || !currentNote || offlineMode
    || isLocalNote(currentNote.id);
  attachmentInput.disabled = !editable || !currentNote || offlineMode
    || isLocalNote(currentNote.id);
  uploadAttachmentButton.disabled = !editable || !currentNote || offlineMode
    || isLocalNote(currentNote.id);
  commentBodyInput.disabled = !currentNote || offlineMode
    || isLocalNote(currentNote.id);
  commentForm.querySelector("button[type=submit]").disabled = !currentNote
    || offlineMode || isLocalNote(currentNote.id);
  reportNoteButton.hidden = !currentNote || offlineMode
    || isLocalNote(currentNote.id);
  updateSelectedFlashcardStatus();
}

function clearEditor() {
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  currentNote = null;
  selectedFlashcardText = "";
  noteForm.reset();
  selectedFlashcardForm.reset();
  updatePreview();
  referencesList.replaceChildren();
  attachmentsList.replaceChildren();
  commentsList.replaceChildren();
  commentForm.reset();
  clearGraph();
  conflictPanel.hidden = true;
  activeConflict = null;
  deleteNoteButton.hidden = true;
  reportNoteButton.hidden = true;
  setEditable(Boolean(currentClass?.ownBranchId)
    && branchSelect.value === currentClass.ownBranchId);
}

function clearGraph() {
  noteGraph.replaceChildren();
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.id = "graph-title";
  title.textContent = "Conexões da nota selecionada";
  const description = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "desc",
  );
  description.id = "graph-description";
  description.textContent = "Mapa de referências da classe.";
  noteGraph.append(title, description);
}

function updateAddress() {
  if (!currentClass) return;
  const address = new URL(window.location.href);
  address.searchParams.set("classId", currentClass.id);
  address.searchParams.set("branchId", branchSelect.value);
  window.history.replaceState(null, "", address);
  const forumAddress = new URL("/forum.html", window.location.origin);
  forumAddress.searchParams.set("classId", currentClass.id);
  forumLink.href = forumAddress.href;
  const flashcardsAddress = new URL("/flashcards.html", window.location.origin);
  flashcardsAddress.searchParams.set("classId", currentClass.id);
  flashcardsLink.href = flashcardsAddress.href;
  const pomodoroAddress = new URL("/pomodoro.html", window.location.origin);
  pomodoroAddress.searchParams.set("classId", currentClass.id);
  pomodoroLink.href = pomodoroAddress.href;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function selectNote(noteId) {
  void openNote(noteId).catch((error) => showFeedback(error.message, true));
}

async function loadBranchNotes() {
  const branchId = branchSelect.value;
  notesList.replaceChildren();
  if (!currentClass || !branchId) return;
  let notes;
  if (offlineMode) {
    notes = await listOfflineNotes(
      currentUser.id,
      currentClass.id,
      branchId,
    );
  } else {
    let result;
    try {
      result = await request(
        `/api/classes/${currentClass.id}/branches/${branchId}/notes?limit=100`,
      );
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      offlineMode = true;
      notes = await listOfflineNotes(
        currentUser.id,
        currentClass.id,
        branchId,
      );
      updateNetworkStatus();
    }
    if (result) {
      notes = result.notes;
      if (branchId === currentClass.ownBranchId) {
        let mutations;
        let drafts;
        try {
          await saveOfflineBranchNotes({
            userId: currentUser.id,
            userName: currentUser.name,
            classId: currentClass.id,
            branchId,
            notes,
          });
          [mutations, drafts] = await Promise.all([
            listNoteMutations(currentUser.id, currentClass.id),
            listOfflineNotes(currentUser.id, currentClass.id, branchId),
          ]);
        } catch (error) {
          updateOfflineStatus(
            `As notas abriram online, mas não foram guardadas offline: ${error.message}`,
            true,
          );
        }
        if (mutations && drafts) {
          const pending = new Map(
            mutations.map((mutation) => [mutation.noteId, mutation]),
          );
          const serverIds = new Set(notes.map((note) => note.id));
          notes = notes.map((note) => {
            const mutation = pending.get(note.id);
            return {
              ...note,
              ...(mutation ? mutation.fields : {}),
              pending: Boolean(mutation),
              conflict: mutation?.conflict,
            };
          });
          for (const localNote of drafts) {
            if (!serverIds.has(localNote.id)) notes.push(localNote);
          }
        }
      }
    }
  }
  for (const note of notes) {
    const item = document.createElement("li");
    const date = note.lessonDate ? ` · ${note.lessonDate}` : "";
    const state = note.conflict
      ? " · Conflito"
      : note.pending
        ? " · Pendente"
        : note.isDraft
          ? " · Rascunho local"
          : "";
    item.append(makeButton(
      `${note.title}${date}${state}`,
      "note-button",
      () => selectNote(note.id),
    ));
    notesList.append(item);
  }
}

async function loadMissedLessons() {
  missedList.replaceChildren();
  if (!currentClass) return;
  if (offlineMode) {
    const empty = document.createElement("li");
    empty.textContent = "Sugestões de aulas perdidas ficam disponíveis online.";
    missedList.append(empty);
    return;
  }
  let result;
  try {
    result = await request(
      `/api/classes/${currentClass.id}/missed-lessons?limit=100`,
    );
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    offlineMode = true;
    updateNetworkStatus();
    const empty = document.createElement("li");
    empty.textContent = "Sugestões de aulas perdidas ficam disponíveis online.";
    missedList.append(empty);
    return;
  }
  for (const lesson of result.lessons) {
    const item = document.createElement("li");
    const date = document.createElement("strong");
    date.textContent = lesson.lessonDate;
    item.append(date);
    for (const suggestion of lesson.suggestions) {
      item.append(document.createTextNode(" "));
      item.append(makeButton(
        `${suggestion.title} — ${suggestion.ownerName}`,
        "suggestion-button",
        () => selectNote(suggestion.noteId),
      ));
    }
    missedList.append(item);
  }
  if (result.lessons.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Nenhuma aula perdida identificada.";
    missedList.append(empty);
  }
}

function showConflict(mutation) {
  activeConflict = mutation;
  conflictPanel.hidden = false;
  conflictMessage.textContent = (
    "Sua versão local foi preservada. Escolha a versão do servidor ou salve a sua como uma nova nota."
  );
  serverNotePreview.textContent = [
    mutation.conflict.title,
    mutation.conflict.lessonDate ?? "Sem data de aula",
    "",
    mutation.conflict.body,
  ].join("\n");
}

function mutationForNote(kind, noteId, fields, baseUpdatedAt = null) {
  return {
    key: offlineNoteKey(currentUser.id, currentClass.id, noteId),
    kind,
    noteId,
    userId: currentUser.id,
    userName: currentUser.name,
    classId: currentClass.id,
    branchId: branchSelect.value,
    clientId: kind === "create" && isLocalNote(noteId)
      ? noteId.slice("local-".length)
      : null,
    baseUpdatedAt,
    fields,
    createdAt: Date.now(),
    conflict: null,
  };
}

async function openNote(noteId) {
  let note;
  let serverNote = null;
  let draft = await getOfflineDraft(
    currentUser.id,
    currentClass.id,
    branchSelect.value,
    noteId,
  );

  if (isLocalNote(noteId)) {
    const stored = await getOfflineNote(currentUser.id, currentClass.id, noteId);
    note = stored ?? (draft ? {
      id: noteId,
      branchId: branchSelect.value,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      updatedAt: null,
      ...draft.fields,
    } : null);
    if (!note) throw new Error("O rascunho local não foi encontrado.");
  } else if (offlineMode) {
    note = await getOfflineNote(currentUser.id, currentClass.id, noteId);
    if (!note) throw new Error("Esta nota não está disponível offline.");
  } else {
    try {
      const result = await request(
        `/api/classes/${currentClass.id}/notes/${noteId}`,
      );
      serverNote = result.note;
      note = serverNote;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      offlineMode = true;
      note = await getOfflineNote(currentUser.id, currentClass.id, noteId);
      if (!note) throw new Error("Esta nota não está disponível offline.");
      updateNetworkStatus();
    }
  }

  const pending = (await listNoteMutations(currentUser.id, currentClass.id))
    .find((mutation) => mutation.noteId === noteId);
  if (pending) {
    note = {
      ...note,
      ...pending.fields,
      baseUpdatedAt: pending.baseUpdatedAt,
      pending: true,
    };
    if (pending.conflict) showConflict(pending);
  }

  if (draft) {
    if (
      serverNote
      && draft.baseUpdatedAt
      && serverNote.updatedAt !== draft.baseUpdatedAt
    ) {
      const mutation = mutationForNote(
        "update",
        noteId,
        draft.fields,
        draft.baseUpdatedAt,
      );
      mutation.conflict = serverNote;
      await saveNoteMutation(mutation);
      await deleteOfflineDraft(
        currentUser.id,
        currentClass.id,
        branchSelect.value,
        noteId,
      );
      showConflict(mutation);
      note = {
        ...serverNote,
        ...draft.fields,
        baseUpdatedAt: draft.baseUpdatedAt,
      };
    } else {
      note = {
        ...note,
        ...draft.fields,
        baseUpdatedAt: draft.baseUpdatedAt,
      };
    }
  }

  currentNote = note;
  if (
    serverNote
    && serverNote.ownerId === currentUser.id
    && currentClass.ownBranchId === branchSelect.value
  ) {
    await saveOfflineNote({
      ...serverNote,
      userId: currentUser.id,
      userName: currentUser.name,
      classId: currentClass.id,
      branchId: branchSelect.value,
    });
  }
  titleInput.value = currentNote.title;
  lessonDateInput.value = currentNote.lessonDate ?? "";
  statusInput.value = currentNote.status;
  bodyInput.value = currentNote.body;
  updatePreview();
  setEditable(currentNote.ownerId === currentUser.id);

  if (offlineMode || isLocalNote(currentNote.id)) {
    referencesList.replaceChildren();
    attachmentsList.replaceChildren();
    commentsList.replaceChildren();
    clearGraph();
    showFeedback("Nota local. Comentários, referências e anexos exigem conexão.");
    return;
  }

  try {
    const [references, graph] = await Promise.all([
      request(
        `/api/classes/${currentClass.id}/notes/${currentNote.id}/references?limit=100`,
      ),
      request(
        `/api/classes/${currentClass.id}/graph?noteId=${currentNote.id}&limit=20`,
      ),
    ]);
    renderReferences(references.references);
    renderGraph(graph);
    await loadCollaboration();
    showFeedback(`Nota de ${currentNote.ownerName}.`);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    offlineMode = true;
    setEditable(currentNote.ownerId === currentUser.id);
    updateNetworkStatus();
    referencesList.replaceChildren();
    attachmentsList.replaceChildren();
    commentsList.replaceChildren();
    clearGraph();
    showFeedback("Conexão perdida. A edição local continua disponível.");
  }
}

async function loadCollaboration() {
  if (!currentNote || !currentClass) return;
  const [comments, attachments] = await Promise.all([
    request(
      `/api/classes/${currentClass.id}/notes/${currentNote.id}/comments?limit=100`,
    ),
    request(
      `/api/classes/${currentClass.id}/notes/${currentNote.id}/attachments`,
    ),
  ]);
  renderComments(comments.comments);
  renderAttachments(attachments.attachments);
}

function renderComments(comments) {
  commentsList.replaceChildren();
  for (const comment of comments) {
    const item = document.createElement("li");
    const heading = document.createElement("strong");
    heading.textContent = `${comment.authorName} · ${new Date(comment.createdAt).toLocaleString("pt-BR")}`;
    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = comment.body;
    const actions = document.createElement("div");
    actions.className = "comment-actions";
    if (comment.authorId === currentUser.id || currentNote.ownerId === currentUser.id) {
      actions.append(makeButton("Excluir comentário", "secondary", async () => {
        try {
          await request(
            `/api/classes/${currentClass.id}/notes/${currentNote.id}/comments/${comment.id}`,
            { method: "DELETE" },
          );
          await loadCollaboration();
          showFeedback("Comentário excluído.");
        } catch (error) {
          showFeedback(error.message, true);
        }
      }));
    }
    actions.append(makeButton("Denunciar", "secondary", () => {
      void submitReport("comment", comment.id);
    }));
    item.append(heading, body, actions);
    commentsList.append(item);
  }
  if (comments.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Nenhum comentário ainda.";
    commentsList.append(empty);
  }
}

function renderAttachments(attachments) {
  attachmentsList.replaceChildren();
  for (const attachment of attachments) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `/api/classes/${currentClass.id}/attachments/${attachment.id}/download`;
    link.textContent = `${attachment.filename} (${Math.ceil(attachment.sizeBytes / 1024)} KB)`;
    link.download = attachment.filename;
    item.append(link);
    if (currentNote.ownerId === currentUser.id) {
      item.append(document.createTextNode(" "));
      item.append(makeButton("Remover", "secondary", async () => {
        try {
          await request(
            `/api/classes/${currentClass.id}/attachments/${attachment.id}`,
            { method: "DELETE" },
          );
          await loadCollaboration();
          showFeedback("Anexo removido.");
        } catch (error) {
          showFeedback(error.message, true);
        }
      }));
    }
    attachmentsList.append(item);
  }
  if (attachments.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Nenhum anexo.";
    attachmentsList.append(empty);
  }
}

async function submitReport(targetType, targetId) {
  if (!currentClass) return;
  const reason = window.prompt("Descreva o motivo da denúncia:");
  if (reason === null || !reason.trim()) return;
  try {
    await request(`/api/classes/${currentClass.id}/reports`, {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, reason }),
    });
    showFeedback("Denúncia enviada.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

function renderReferences(references) {
  referencesList.replaceChildren();
  for (const reference of references) {
    const item = document.createElement("li");
    item.append(makeButton(
      `${reference.title} — ${reference.ownerName}`,
      "note-button",
      () => selectNote(reference.noteId),
    ));
    referencesList.append(item);
  }
}

function renderGraph(graph) {
  clearGraph();
  const svgNamespace = "http://www.w3.org/2000/svg";
  const positions = new Map();
  const neighbors = graph.nodes.filter((node) => !node.isRoot);
  const center = { x: 400, y: 250 };
  positions.set(graph.rootNoteId, center);
  neighbors.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(neighbors.length, 1)
      - Math.PI / 2;
    positions.set(node.id, {
      x: center.x + Math.cos(angle) * 185,
      y: center.y + Math.sin(angle) * 185,
    });
  });

  for (const edge of graph.edges) {
    const from = positions.get(edge.fromNoteId);
    const to = positions.get(edge.toNoteId);
    if (!from || !to) continue;
    const line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.setAttribute("class", "graph-edge");
    noteGraph.append(line);
  }

  for (const node of graph.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const group = document.createElementNS(svgNamespace, "g");
    group.setAttribute("class", node.isRoot ? "graph-node root" : "graph-node");
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `${node.title}, ${node.ownerName}`);
    group.addEventListener("click", () => selectNote(node.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNote(node.id);
      }
    });

    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", String(position.x));
    circle.setAttribute("cy", String(position.y));
    circle.setAttribute("r", node.isRoot ? "31" : "24");
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("x", String(position.x));
    label.setAttribute("y", String(position.y + 43));
    label.textContent = node.title.length > 28
      ? `${node.title.slice(0, 25)}...`
      : node.title;
    const nodeTitle = document.createElementNS(svgNamespace, "title");
    nodeTitle.textContent = `${node.title} — ${node.ownerName}`;
    group.append(circle, label, nodeTitle);
    noteGraph.append(group);
  }
}

async function openReferencePicker() {
  if (!currentNote || !canEdit) return;
  try {
    const result = await request(
      `/api/classes/${currentClass.id}/reference-candidates?noteId=${currentNote.id}&limit=100`,
    );
    referenceCandidates = result.candidates;
    referenceSelect.replaceChildren();
    for (const candidate of referenceCandidates) {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = `${candidate.title} — ${candidate.ownerName}`;
      referenceSelect.append(option);
    }
    if (result.candidates.length === 0) {
      showFeedback("Não há notas disponíveis em outras branches.");
      return;
    }
    referenceDialog.showModal();
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function insertReference() {
  const candidateId = referenceSelect.value;
  const candidate = referenceCandidates.find(
    (item) => item.id === candidateId,
  );
  if (!candidate || !currentNote || !canEdit) return;
  try {
    await request(
      `/api/classes/${currentClass.id}/notes/${currentNote.id}/references`,
      {
        method: "POST",
        body: JSON.stringify({ targetNoteId: candidateId }),
      },
    );
    const marker = `[[${candidate.title}]]`;
    bodyInput.setRangeText(
      marker,
      bodyInput.selectionStart,
      bodyInput.selectionEnd,
      "end",
    );
    updatePreview();
    referenceDialog.close();
    const [references, graph] = await Promise.all([
      request(
        `/api/classes/${currentClass.id}/notes/${currentNote.id}/references?limit=100`,
      ),
      request(
        `/api/classes/${currentClass.id}/graph?noteId=${currentNote.id}&limit=20`,
      ),
    ]);
    renderReferences(references.references);
    renderGraph(graph);
    bodyInput.focus();
    showFeedback("Referência inserida. Salve a nota para registrar o texto.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

async function loadClass(classId, preferredBranchId) {
  const selectedClass = classes.find((item) => item.id === classId);
  if (!selectedClass) return;
  let className = selectedClass.name;
  let branches = [{
    id: selectedClass.branchId,
    ownerId: currentUser.id,
    ownerName: currentUser.name,
  }];
  if (!offlineMode) {
    try {
      const result = await request(`/api/classes/${classId}?limit=100`);
      className = result.class.name;
      branches = [...result.branches];
      if (!branches.some((branch) => branch.id === selectedClass.branchId)) {
        branches.unshift({
          id: selectedClass.branchId,
          ownerId: currentUser.id,
          ownerName: currentUser.name,
        });
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      offlineMode = true;
      updateNetworkStatus();
    }
  }
  currentClass = {
    id: classId,
    ownBranchId: selectedClass.branchId,
    name: className,
  };
  branchSelect.replaceChildren();
  for (const branch of branches) {
    const option = document.createElement("option");
    option.value = branch.id;
    option.textContent = branch.ownerId === currentUser.id
      ? `${branch.ownerName} (minha branch)`
      : branch.ownerName;
    branchSelect.append(option);
  }
  const branchExists = branches.some((branch) => branch.id === preferredBranchId);
  branchSelect.value = branchExists ? preferredBranchId : selectedClass.branchId;
  clearEditor();
  updateAddress();
  await Promise.all([loadBranchNotes(), loadMissedLessons()]);
  showFeedback(`Classe: ${className}.`);
}

classSelect.addEventListener("change", async () => {
  try {
    await loadClass(classSelect.value);
  } catch (error) {
    showFeedback(error.message, true);
  }
});

branchSelect.addEventListener("change", async () => {
  try {
    clearEditor();
    updateAddress();
    await loadBranchNotes();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

newNoteButton.addEventListener("click", () => {
  clearEditor();
  try {
    currentNote = {
      id: localNoteId(),
      branchId: branchSelect.value,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      title: "",
      body: "",
      lessonDate: null,
      status: "draft",
      updatedAt: null,
    };
    setEditable(true);
    scheduleDraftSave();
  } catch (error) {
    showFeedback(error.message, true);
  }
  titleInput.focus();
  showFeedback("Nova nota.");
});

referenceButton.addEventListener("click", () => {
  void openReferencePicker();
});

insertReferenceButton.addEventListener("click", () => {
  void insertReference();
});

bodyInput.addEventListener("keydown", (event) => {
  if (event.altKey && event.shiftKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    void openReferencePicker();
  }
});

for (const field of [titleInput, lessonDateInput, statusInput, bodyInput]) {
  field.addEventListener("input", scheduleDraftSave);
}
bodyInput.addEventListener("input", updatePreview);
noteForm.addEventListener("focusout", (event) => {
  if (event.relatedTarget?.id === "save-note") return;
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    void saveCurrentDraft().catch((error) => {
      updateOfflineStatus(error.message, true);
    });
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || draftSaveTimer === null) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  void saveCurrentDraft().catch((error) => {
    updateOfflineStatus(error.message, true);
  });
});

attachmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = attachmentInput.files?.[0];
  if (!file || !currentNote || !canEdit) return;
  try {
    await request(
      `/api/classes/${currentClass.id}/notes/${currentNote.id}/attachments`,
      {
        method: "POST",
        headers: {
          "content-type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      },
    );
    attachmentForm.reset();
    await loadCollaboration();
    showFeedback("Anexo enviado.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentNote || !currentClass) return;
  try {
    await request(
      `/api/classes/${currentClass.id}/notes/${currentNote.id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: commentBodyInput.value }),
      },
    );
    commentForm.reset();
    await loadCollaboration();
    showFeedback("Comentário publicado.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

reportNoteButton.addEventListener("click", () => {
  if (currentNote) void submitReport("note", currentNote.id);
});

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit || !currentClass) return;
  const values = currentNoteFields();
  const noteId = currentNote?.id ?? localNoteId();
  const isCreate = isLocalNote(noteId);
  const baseUpdatedAt = isCreate
    ? null
    : currentNote.baseUpdatedAt ?? currentNote.updatedAt;
  const mutation = mutationForNote(
    isCreate ? "create" : "update",
    noteId,
    values,
    baseUpdatedAt,
  );
  const keepLocally = async (conflict = null) => {
    mutation.conflict = conflict;
    await saveNoteMutation(mutation);
    await saveOfflineNote(offlineNoteRecord(noteId, values, {
      baseUpdatedAt,
      pending: true,
    }));
    await deleteOfflineDraft(
      currentUser.id,
      currentClass.id,
      branchSelect.value,
      noteId,
    );
    currentNote = {
      ...offlineNoteRecord(noteId, values, { baseUpdatedAt, pending: true }),
      baseUpdatedAt,
    };
    setEditable(true);
    if (conflict) showConflict(mutation);
  };

  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }

  if (offlineMode) {
    try {
      await keepLocally();
      await loadBranchNotes();
      showFeedback("Nota salva neste dispositivo e aguardando sincronização.");
      return;
    } catch (error) {
      showFeedback(error.message, true);
      return;
    }
  }

  const path = isCreate
    ? `/api/classes/${currentClass.id}/branches/${branchSelect.value}/notes`
    : `/api/classes/${currentClass.id}/notes/${noteId}`;
  let result;
  try {
    result = await request(path, {
      method: isCreate ? "POST" : "PATCH",
      body: JSON.stringify(isCreate
        ? { ...values, clientId: noteId.slice("local-".length) }
        : { ...values, baseUpdatedAt }),
    });
  } catch (error) {
    if (error.status === 409 && error.payload?.codigo === "CONFLITO_NOTA") {
      try {
        await keepLocally(error.payload.note);
        showFeedback("A versão local foi preservada; escolha como resolver o conflito.", true);
      } catch (storageError) {
        showFeedback(storageError.message, true);
      }
      return;
    }
    if (error instanceof TypeError) {
      offlineMode = true;
      updateNetworkStatus();
      try {
        await keepLocally();
        await loadBranchNotes();
        showFeedback("Conexão perdida. Nota salva e aguardando sincronização.");
      } catch (storageError) {
        showFeedback(storageError.message, true);
      }
      return;
    }
    showFeedback(error.message, true);
    return;
  }

  currentNote = {
    ...result.note,
    ownerId: currentUser.id,
    ownerName: currentUser.name,
    baseUpdatedAt: result.note.updatedAt,
  };
  try {
    await completeNoteMutation(mutation, result.note);
  } catch (error) {
    setEditable(true);
    showFeedback(
      "Nota salva no servidor, mas a cópia offline não foi atualizada.",
      true,
    );
    updateOfflineStatus(error.message, true);
    return;
  }
  setEditable(true);
  await Promise.all([loadBranchNotes(), loadMissedLessons()]);
  updateAddress();
  showFeedback("Nota salva.");
});

document.addEventListener("selectionchange", updateSelectedFlashcard);

selectedFlashcardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (
    !currentClass
    || !currentNote
    || !selectedFlashcardText
    || selectedFlashcardText.length > selectedFlashcardAnswer.maxLength
  ) {
    showFeedback("Selecione um trecho válido na visualização da nota.", true);
    return;
  }
  try {
    await request(`/api/classes/${currentClass.id}/flashcards`, {
      method: "POST",
      body: JSON.stringify({
        question: selectedFlashcardQuestion.value,
        answer: selectedFlashcardText,
        noteId: currentNote.id,
      }),
    });
    selectedFlashcardForm.reset();
    selectedFlashcardText = "";
    updateSelectedFlashcardStatus();
    showFeedback("Flashcard criado. Você já pode revisá-lo na tela de flashcards.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

deleteNoteButton.addEventListener("click", async () => {
  if (!currentNote || !canEdit) return;
  if (!window.confirm("Excluir esta nota?")) return;
  try {
    await request(`/api/classes/${currentClass.id}/notes/${currentNote.id}`, {
      method: "DELETE",
    });
    clearEditor();
    await Promise.all([loadBranchNotes(), loadMissedLessons()]);
    showFeedback("Nota excluída.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

syncNowButton.addEventListener("click", () => {
  void synchronizePending();
});

clearOfflineDataButton.addEventListener("click", async () => {
  if (!window.confirm("Apagar notas, rascunhos e alterações pendentes deste dispositivo?")) {
    return;
  }
  try {
    await clearOfflineData();
    clearEditor();
    notesList.replaceChildren();
    missedList.replaceChildren();
    updateOfflineStatus("Os dados offline deste dispositivo foram apagados.");
  } catch (error) {
    updateOfflineStatus(error.message, true);
  }
});

useServerVersionButton.addEventListener("click", async () => {
  if (!activeConflict) return;
  const conflict = activeConflict;
  const serverNote = conflict.conflict;
  try {
    await saveOfflineNote({
      ...serverNote,
      userId: currentUser.id,
      userName: currentUser.name,
      classId: conflict.classId,
      branchId: conflict.branchId,
    });
    await Promise.all([
      deleteNoteMutation(conflict.key),
      deleteOfflineDraft(
        conflict.userId,
        conflict.classId,
        conflict.branchId,
        conflict.noteId,
      ),
      ...(isLocalNote(conflict.noteId)
        ? [deleteOfflineNote(
          conflict.userId,
          conflict.classId,
          conflict.noteId,
        )]
        : []),
    ]);
    activeConflict = null;
    conflictPanel.hidden = true;
    currentNote = serverNote;
    titleInput.value = serverNote.title;
    lessonDateInput.value = serverNote.lessonDate ?? "";
    statusInput.value = serverNote.status;
    bodyInput.value = serverNote.body;
    updatePreview();
    setEditable(serverNote.ownerId === currentUser.id);
    await loadBranchNotes();
    showFeedback("Versão atual do servidor carregada.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

saveLocalCopyButton.addEventListener("click", async () => {
  if (!activeConflict) return;
  const conflict = activeConflict;
  const serverNote = conflict.conflict;
  try {
    await saveOfflineNote({
      ...serverNote,
      userId: currentUser.id,
      userName: currentUser.name,
      classId: conflict.classId,
      branchId: conflict.branchId,
    });
    await Promise.all([
      deleteNoteMutation(conflict.key),
      deleteOfflineDraft(
        conflict.userId,
        conflict.classId,
        conflict.branchId,
        conflict.noteId,
      ),
      ...(isLocalNote(conflict.noteId)
        ? [deleteOfflineNote(
          conflict.userId,
          conflict.classId,
          conflict.noteId,
        )]
        : []),
    ]);
    const newId = localNoteId();
    const fields = conflict.fields;
    const copy = offlineNoteRecord(newId, fields, { pending: true });
    const createMutation = mutationForNote("create", newId, fields);
    await saveOfflineNote(copy);
    await saveNoteMutation(createMutation);
    activeConflict = null;
    conflictPanel.hidden = true;
    currentNote = copy;
    titleInput.value = fields.title;
    lessonDateInput.value = fields.lessonDate ?? "";
    statusInput.value = fields.status;
    bodyInput.value = fields.body;
    updatePreview();
    setEditable(true);
    await loadBranchNotes();
    showFeedback("Sua versão foi preservada como uma nova nota pendente.");
    if (navigator.onLine) await synchronizePending({ quiet: true });
  } catch (error) {
    showFeedback(error.message, true);
  }
});

async function synchronizePending({ quiet = false } = {}) {
  if (!currentUser || syncInProgress) return;
  if (!navigator.onLine) {
    offlineMode = true;
    updateNetworkStatus();
    return;
  }

  syncInProgress = true;
  updateOfflineStatus("Sincronizando alterações...");
  let result;
  try {
    result = await syncPendingNotes(currentUser.id, request);
    offlineMode = result.interrupted;
    if (result.conflicts.length > 0) showConflict(result.conflicts[0]);
    if (!offlineMode) {
      await loadBranchNotes();
      await loadMissedLessons();
    }
    const syncedCurrent = result.synced.find((item) => (
      item.localNoteId === currentNote?.id
      || item.note.id === currentNote?.id
    ));
    if (syncedCurrent) await openNote(syncedCurrent.note.id);

    if (result.errors.length > 0) {
      updateOfflineStatus(result.errors[0].message, true);
    } else if (result.interrupted) {
      updateNetworkStatus();
    } else if (result.synced.length > 0) {
      updateOfflineStatus(
        `${result.synced.length} alteração(ões) sincronizada(s).`,
      );
    } else if (result.conflicts.length > 0) {
      updateOfflineStatus("Há conflitos que precisam da sua decisão.", true);
    } else if (!quiet) {
      updateOfflineStatus("Não há alterações pendentes.");
    } else {
      updateNetworkStatus();
    }
  } catch (error) {
    updateOfflineStatus(error.message, true);
  } finally {
    syncInProgress = false;
    syncNowButton.disabled = !navigator.onLine;
  }
}

async function start() {
  const address = new URL(window.location.href);
  try {
    const [me, classResult] = await Promise.all([
      request("/api/me"),
      request("/api/classes?limit=100"),
    ]);
    currentUser = me.user;
    classes = classResult.classes;
    if (offlineStorageAvailable()) {
      try {
        await saveOfflineSession({
          userId: currentUser.id,
          userName: currentUser.name,
          classes,
        });
      } catch (error) {
        updateOfflineStatus(
          `O armazenamento offline não está disponível: ${error.message}`,
          true,
        );
      }
    } else {
      updateOfflineStatus("Este navegador não oferece armazenamento offline.", true);
    }
  } catch (error) {
    if (!(error instanceof TypeError)) {
      showFeedback(error.message, true);
      setEditable(false);
      return;
    }
    let cachedSession;
    try {
      cachedSession = await getOfflineSession();
    } catch (storageError) {
      showFeedback(storageError.message, true);
      setEditable(false);
      return;
    }
    if (!cachedSession) {
      showFeedback("Conecte-se para carregar suas classes pela primeira vez.", true);
      setEditable(false);
      return;
    }
    currentUser = { id: cachedSession.userId, name: cachedSession.userName };
    classes = cachedSession.classes;
    offlineMode = true;
    updateNetworkStatus();
  }

  classSelect.replaceChildren();
  for (const item of classes) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    classSelect.append(option);
  }
  if (classes.length === 0) {
    showFeedback("Entre em uma classe antes de abrir as anotações.");
    setEditable(false);
    return;
  }
  const requestedClassId = address.searchParams.get("classId");
  const selectedClass = classes.find((item) => item.id === requestedClassId)
    ?? classes[0];
  classSelect.value = selectedClass.id;
  try {
    await loadClass(
      selectedClass.id,
      address.searchParams.get("branchId"),
    );
    if (!offlineMode) await synchronizePending({ quiet: true });
  } catch (error) {
    showFeedback(error.message, true);
    setEditable(false);
  }
}

syncNowButton.disabled = !navigator.onLine;
window.addEventListener("connection-state-change", () => {
  if (!navigator.onLine) offlineMode = true;
  updateNetworkStatus();
  if (navigator.onLine) void synchronizePending({ quiet: true });
});
window.addEventListener("pwa-ready", () => {
  updateOfflineStatus("App pronto para abrir a casca offline.");
});
window.addEventListener("pwa-registration-error", () => {
  updateOfflineStatus("Não foi possível preparar o modo PWA neste navegador.", true);
});
start();

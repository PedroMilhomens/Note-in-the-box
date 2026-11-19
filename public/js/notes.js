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

let currentUser = null;
let classes = [];
let currentClass = null;
let currentNote = null;
let canEdit = false;
let referenceCandidates = [];

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
    throw new Error(payload?.erro ?? "Não foi possível concluir a solicitação.");
  }
  if (!payload) throw new Error("Resposta inválida do servidor.");
  return payload;
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function updatePreview() {
  preview.textContent = bodyInput.value;
}

function setEditable(editable) {
  canEdit = editable;
  for (const field of [titleInput, lessonDateInput, statusInput, bodyInput]) {
    field.disabled = !editable;
  }
  document.querySelector("#save-note").disabled = !editable;
  deleteNoteButton.hidden = !editable || !currentNote;
  newNoteButton.disabled = !editable;
  referenceButton.disabled = !editable || !currentNote;
  attachmentInput.disabled = !editable || !currentNote;
  uploadAttachmentButton.disabled = !editable || !currentNote;
  commentBodyInput.disabled = !currentNote;
  commentForm.querySelector("button[type=submit]").disabled = !currentNote;
}

function clearEditor() {
  currentNote = null;
  noteForm.reset();
  updatePreview();
  referencesList.replaceChildren();
  attachmentsList.replaceChildren();
  commentsList.replaceChildren();
  commentForm.reset();
  clearGraph();
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
  const result = await request(
    `/api/classes/${currentClass.id}/branches/${branchId}/notes?limit=100`,
  );
  for (const note of result.notes) {
    const item = document.createElement("li");
    const date = note.lessonDate ? ` · ${note.lessonDate}` : "";
    item.append(makeButton(
      `${note.title}${date}`,
      "note-button",
      () => selectNote(note.id),
    ));
    notesList.append(item);
  }
}

async function loadMissedLessons() {
  missedList.replaceChildren();
  if (!currentClass) return;
  const result = await request(
    `/api/classes/${currentClass.id}/missed-lessons?limit=100`,
  );
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

async function openNote(noteId) {
  const result = await request(`/api/classes/${currentClass.id}/notes/${noteId}`);
  currentNote = result.note;
  titleInput.value = currentNote.title;
  lessonDateInput.value = currentNote.lessonDate ?? "";
  statusInput.value = currentNote.status;
  bodyInput.value = currentNote.body;
  updatePreview();
  setEditable(currentNote.ownerId === currentUser.id);
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
  reportNoteButton.hidden = false;
  await loadCollaboration();
  showFeedback(`Nota de ${currentNote.ownerName}.`);
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
  const result = await request(`/api/classes/${classId}?limit=100`);
  const branches = [...result.branches];
  if (!branches.some((branch) => branch.id === selectedClass.branchId)) {
    branches.unshift({
      id: selectedClass.branchId,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
    });
  }
  currentClass = {
    id: classId,
    ownBranchId: selectedClass.branchId,
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
  showFeedback(`Classe: ${result.class.name}.`);
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

bodyInput.addEventListener("input", updatePreview);

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
  const values = {
    title: titleInput.value,
    lessonDate: lessonDateInput.value || null,
    status: statusInput.value,
    body: bodyInput.value,
  };
  const path = currentNote
    ? `/api/classes/${currentClass.id}/notes/${currentNote.id}`
    : `/api/classes/${currentClass.id}/branches/${branchSelect.value}/notes`;
  try {
    const result = await request(path, {
      method: currentNote ? "PATCH" : "POST",
      body: JSON.stringify(values),
    });
    currentNote = {
      ...result.note,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
    };
    setEditable(true);
    await Promise.all([loadBranchNotes(), loadMissedLessons()]);
    updateAddress();
    showFeedback("Nota salva.");
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

async function start() {
  try {
    const [me, classResult] = await Promise.all([
      request("/api/me"),
      request("/api/classes?limit=100"),
    ]);
    currentUser = me.user;
    classes = classResult.classes;
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
    const address = new URL(window.location.href);
    const requestedClassId = address.searchParams.get("classId");
    const selectedClass = classes.find((item) => item.id === requestedClassId)
      ?? classes[0];
    classSelect.value = selectedClass.id;
    await loadClass(
      selectedClass.id,
      address.searchParams.get("branchId"),
    );
  } catch (error) {
    showFeedback(error.message, true);
    setEditable(false);
  }
}

start();

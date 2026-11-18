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

let currentUser = null;
let classes = [];
let currentClass = null;
let currentNote = null;
let canEdit = false;

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
}

function clearEditor() {
  currentNote = null;
  noteForm.reset();
  updatePreview();
  deleteNoteButton.hidden = true;
  setEditable(Boolean(currentClass?.ownBranchId)
    && branchSelect.value === currentClass.ownBranchId);
}

function updateAddress() {
  if (!currentClass) return;
  const address = new URL(window.location.href);
  address.searchParams.set("classId", currentClass.id);
  address.searchParams.set("branchId", branchSelect.value);
  window.history.replaceState(null, "", address);
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
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
      () => openNote(note.id),
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
        () => openNote(suggestion.noteId),
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
  showFeedback(`Nota de ${currentNote.ownerName}.`);
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

bodyInput.addEventListener("input", updatePreview);

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

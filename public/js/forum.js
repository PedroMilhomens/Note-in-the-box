const classSelect = document.querySelector("#class-select");
const className = document.querySelector("#class-name");
const feedback = document.querySelector("#feedback");
const flashcardsLink = document.querySelector("#flashcards-link");
const rulesView = document.querySelector("#rules-view");
const rulesForm = document.querySelector("#rules-form");
const rulesInput = document.querySelector("#rules-input");
const topicsList = document.querySelector("#topics-list");
const topicForm = document.querySelector("#topic-form");
const topicTitleInput = document.querySelector("#topic-title");
const topicBodyInput = document.querySelector("#topic-body");
const topicNoteSelect = document.querySelector("#topic-note");
const topicPlaceholder = document.querySelector("#topic-placeholder");
const topicDetail = document.querySelector("#topic-detail");
const topicTitleView = document.querySelector("#topic-title-view");
const topicMeta = document.querySelector("#topic-meta");
const topicBodyView = document.querySelector("#topic-body-view");
const topicNoteLink = document.querySelector("#topic-note-link");
const topicActions = document.querySelector("#topic-actions");
const postsList = document.querySelector("#posts-list");
const postForm = document.querySelector("#post-form");
const postBodyInput = document.querySelector("#post-body");

let currentUser = null;
let classes = [];
let currentClass = null;
let currentTopic = null;

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

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR");
}

function selectedClassPath(suffix) {
  return `/api/classes/${currentClass.id}${suffix}`;
}

function clearTopic() {
  currentTopic = null;
  topicDetail.hidden = true;
  topicPlaceholder.hidden = false;
  postsList.replaceChildren();
  postForm.hidden = true;
}

async function submitReport(targetType, targetId) {
  const reason = window.prompt("Descreva o motivo da denúncia:");
  if (reason === null || !reason.trim() || !currentClass) return;
  try {
    await request(selectedClassPath("/reports"), {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, reason }),
    });
    showFeedback("Denúncia enviada.");
  } catch (error) {
    showFeedback(error.message, true);
  }
}

function renderTopicActions(topic) {
  topicActions.replaceChildren();
  topicActions.append(makeButton("Denunciar tópico", "secondary", () => {
    void submitReport("topic", topic.id);
  }));
  if (topic.authorId === currentUser.id || currentClass.role === "owner") {
    topicActions.append(makeButton("Excluir tópico", "secondary", async () => {
      if (!window.confirm("Excluir este tópico?")) return;
      try {
        await request(selectedClassPath(`/forum/topics/${topic.id}`), {
          method: "DELETE",
        });
        clearTopic();
        await loadTopics();
        showFeedback("Tópico excluído.");
      } catch (error) {
        showFeedback(error.message, true);
      }
    }));
  }
}

function renderPosts(posts) {
  postsList.replaceChildren();
  for (const post of posts) {
    const item = document.createElement("li");
    item.className = "post-item";
    const author = document.createElement("strong");
    author.className = "post-meta";
    author.textContent = `${post.authorName} · ${formatDate(post.createdAt)}`;
    const body = document.createElement("p");
    body.className = "preformatted";
    body.textContent = post.body;
    const actions = document.createElement("div");
    actions.className = "forum-actions";
    actions.append(makeButton("Denunciar resposta", "secondary", () => {
      void submitReport("post", post.id);
    }));
    if (post.authorId === currentUser.id || currentClass.role === "owner") {
      actions.append(makeButton("Excluir resposta", "secondary", async () => {
        if (!window.confirm("Excluir esta resposta?")) return;
        try {
          await request(
            selectedClassPath(`/forum/topics/${currentTopic.id}/posts/${post.id}`),
            { method: "DELETE" },
          );
          await loadTopics(currentTopic.id);
          showFeedback("Resposta excluída.");
        } catch (error) {
          showFeedback(error.message, true);
        }
      }));
    }
    item.append(author, body, actions);
    postsList.append(item);
  }
  if (posts.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Ainda não há respostas.";
    postsList.append(empty);
  }
}

async function loadTopic(topicId) {
  const result = await request(
    selectedClassPath(`/forum/topics/${topicId}/posts?limit=100`),
  );
  currentTopic = result.topic;
  topicTitleView.textContent = currentTopic.title;
  topicMeta.textContent = `${currentTopic.authorName} · ${formatDate(currentTopic.createdAt)}`;
  topicBodyView.textContent = currentTopic.body;
  topicNoteLink.hidden = !currentTopic.noteId || !currentTopic.noteBranchId;
  if (!topicNoteLink.hidden) {
    const noteUrl = new URL("/notes.html", window.location.origin);
    noteUrl.searchParams.set("classId", currentClass.id);
    noteUrl.searchParams.set("branchId", currentTopic.noteBranchId);
    topicNoteLink.href = noteUrl.href;
    topicNoteLink.textContent = `Nota relacionada: ${currentTopic.noteTitle}`;
  } else {
    topicNoteLink.removeAttribute("href");
    topicNoteLink.textContent = "";
  }
  renderTopicActions(currentTopic);
  renderPosts(result.posts);
  topicPlaceholder.hidden = true;
  topicDetail.hidden = false;
  postForm.hidden = false;
}

async function loadTopics(preferredTopicId = null) {
  topicsList.replaceChildren();
  const result = await request(selectedClassPath("/forum/topics?limit=100"));
  for (const topic of result.topics) {
    const item = document.createElement("li");
    const noteLabel = topic.noteTitle ? ` · Nota: ${topic.noteTitle}` : "";
    item.append(makeButton(
      `${topic.title} — ${topic.authorName} (${topic.postCount} respostas)${noteLabel}`,
      "note-button",
      () => {
        void loadTopic(topic.id).catch((error) => showFeedback(error.message, true));
      },
    ));
    topicsList.append(item);
  }
  if (result.topics.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Ainda não há tópicos nesta classe.";
    topicsList.append(empty);
  }
  if (preferredTopicId) await loadTopic(preferredTopicId);
  else clearTopic();
}

async function loadNoteOptions() {
  const result = await request(selectedClassPath("/forum/notes?limit=100"));
  topicNoteSelect.replaceChildren();
  const noNote = document.createElement("option");
  noNote.value = "";
  noNote.textContent = "Sem nota relacionada";
  topicNoteSelect.append(noNote);
  for (const note of result.notes) {
    const option = document.createElement("option");
    option.value = note.id;
    option.textContent = `${note.title} — ${note.ownerName}`;
    topicNoteSelect.append(option);
  }
}

async function loadClass(classId) {
  const selected = classes.find((item) => item.id === classId);
  if (!selected) return;
  const result = await request(`/api/classes/${classId}?limit=100`);
  currentClass = { ...selected, name: result.class.name };
  className.textContent = result.class.name;
  rulesView.textContent = result.class.rules || "O proprietário ainda não publicou regras.";
  rulesInput.value = result.class.rules;
  rulesForm.hidden = currentClass.role !== "owner";
  clearTopic();
  const address = new URL(window.location.href);
  address.searchParams.set("classId", classId);
  window.history.replaceState(null, "", address);
  const flashcardsAddress = new URL("/flashcards.html", window.location.origin);
  flashcardsAddress.searchParams.set("classId", classId);
  flashcardsLink.href = flashcardsAddress.href;
  await Promise.all([loadTopics(), loadNoteOptions()]);
  showFeedback(`Fórum da classe ${result.class.name}.`);
}

classSelect.addEventListener("change", () => {
  void loadClass(classSelect.value).catch((error) => showFeedback(error.message, true));
});

rulesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentClass || currentClass.role !== "owner") return;
  try {
    const result = await request(selectedClassPath("/rules"), {
      method: "PATCH",
      body: JSON.stringify({ rules: rulesInput.value }),
    });
    rulesView.textContent = result.class.rules || "O proprietário ainda não publicou regras.";
    rulesInput.value = result.class.rules;
    showFeedback("Regras salvas.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

topicForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentClass) return;
  try {
    const result = await request(selectedClassPath("/forum/topics"), {
      method: "POST",
      body: JSON.stringify({
        title: topicTitleInput.value,
        body: topicBodyInput.value,
        noteId: topicNoteSelect.value || null,
      }),
    });
    topicForm.reset();
    await loadTopics(result.topic.id);
    showFeedback("Tópico publicado.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentClass || !currentTopic) return;
  const topicId = currentTopic.id;
  try {
    await request(
      selectedClassPath(`/forum/topics/${topicId}/posts`),
      {
        method: "POST",
        body: JSON.stringify({ body: postBodyInput.value }),
      },
    );
    postForm.reset();
    await loadTopics(topicId);
    showFeedback("Resposta publicada.");
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
      classSelect.disabled = true;
      topicForm.hidden = true;
      rulesForm.hidden = true;
      showFeedback("Entre em uma classe antes de abrir o fórum.");
      return;
    }
    const requestedId = new URL(window.location.href).searchParams.get("classId");
    const initialClass = classes.find((item) => item.id === requestedId) ?? classes[0];
    classSelect.value = initialClass.id;
    await loadClass(initialClass.id);
  } catch (error) {
    showFeedback(error.message, true);
    classSelect.disabled = true;
    topicForm.hidden = true;
    rulesForm.hidden = true;
  }
}

start();

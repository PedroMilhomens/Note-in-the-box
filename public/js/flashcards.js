const PAGE_SIZE = 50;
const RATINGS = [
  { value: "errei", label: "Errei" },
  { value: "dificil", label: "Difícil" },
  { value: "bom", label: "Bom" },
  { value: "facil", label: "Fácil" },
];

const classSelect = document.querySelector("#class-select");
const className = document.querySelector("#class-name");
const feedback = document.querySelector("#feedback");
const dueList = document.querySelector("#due-list");
const dueStatus = document.querySelector("#due-status");
const duePrevious = document.querySelector("#due-previous");
const dueNext = document.querySelector("#due-next");
const duePage = document.querySelector("#due-page");
const cardsList = document.querySelector("#cards-list");
const cardsPrevious = document.querySelector("#cards-previous");
const cardsNext = document.querySelector("#cards-next");
const cardsPage = document.querySelector("#cards-page");
const flashcardForm = document.querySelector("#flashcard-form");
const questionInput = document.querySelector("#question");
const answerInput = document.querySelector("#answer");
const createCardButton = document.querySelector("#create-card");
const weeklyTotal = document.querySelector("#weekly-total");
const weeklyList = document.querySelector("#weekly-list");
const forumLink = document.querySelector("#forum-link");
const notesLink = document.querySelector(".page-header .brand");

let classes = [];
let currentClass = null;
let dueOffset = 0;
let cardsOffset = 0;

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

function classPath(suffix) {
  return `/api/classes/${currentClass.id}/flashcards${suffix}`;
}

function renderDueCard(card) {
  const item = document.createElement("li");
  item.className = "flashcard-item";
  const question = document.createElement("h3");
  question.textContent = card.question;
  const answer = document.createElement("p");
  answer.className = "flashcard-answer";
  answer.textContent = card.answer;
  answer.hidden = true;
  const reveal = makeButton("Mostrar resposta", "secondary", () => {
    answer.hidden = false;
    reveal.hidden = true;
    ratings.hidden = false;
  });
  const ratings = document.createElement("div");
  ratings.className = "rating-actions";
  ratings.hidden = true;
  for (const rating of RATINGS) {
    ratings.append(makeButton(rating.label, "secondary", async () => {
      const buttons = ratings.querySelectorAll("button");
      for (const button of buttons) button.disabled = true;
      try {
        await request(`/api/flashcards/${card.id}/review`, {
          method: "POST",
          body: JSON.stringify({ rating: rating.value }),
        });
        showFeedback("Revisão registrada.");
        const result = await loadDue(dueOffset);
        if (result.cards.length === 0 && dueOffset > 0) {
          await loadDue(Math.max(0, dueOffset - PAGE_SIZE));
        }
        await loadPerformance();
        await loadCards(cardsOffset);
      } catch (error) {
        for (const button of buttons) button.disabled = false;
        showFeedback(error.message, true);
      }
    }));
  }
  item.append(question, answer, reveal, ratings);
  return item;
}

function renderDueCards(cards) {
  dueList.replaceChildren();
  for (const card of cards) dueList.append(renderDueCard(card));
  if (cards.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Você não tem revisões pendentes nesta página.";
    dueList.append(empty);
  }
}

async function loadDue(offset = dueOffset) {
  dueOffset = offset;
  const result = await request(
    classPath(`/due?limit=${PAGE_SIZE}&offset=${dueOffset}`),
  );
  renderDueCards(result.cards);
  dueStatus.textContent = `${result.cards.length} cartão(ões) pendente(s) nesta página.`;
  duePrevious.disabled = dueOffset === 0;
  dueNext.disabled = result.cards.length < PAGE_SIZE;
  duePage.textContent = `Página ${Math.floor(dueOffset / PAGE_SIZE) + 1}`;
  return result;
}

function renderFlashcard(card) {
  const item = document.createElement("li");
  item.className = "flashcard-item";
  const question = document.createElement("h3");
  question.textContent = card.question;
  const answer = document.createElement("p");
  answer.className = "flashcard-answer";
  answer.textContent = card.answer;
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Ver resposta";
  details.append(summary, answer);
  item.append(question, details);
  if (card.noteTitle) {
    const note = document.createElement("p");
    note.textContent = `Nota relacionada: ${card.noteTitle}`;
    item.append(note);
  }
  const due = document.createElement("p");
  due.className = "muted";
  due.textContent = card.nextDueAt
    ? `Próxima revisão: ${new Date(card.nextDueAt).toLocaleString("pt-BR")}`
    : "Ainda não revisado";
  item.append(due);
  return item;
}

async function loadCards(offset = cardsOffset) {
  cardsOffset = offset;
  const result = await request(classPath(`?limit=${PAGE_SIZE}&offset=${cardsOffset}`));
  cardsList.replaceChildren();
  for (const card of result.cards) cardsList.append(renderFlashcard(card));
  if (result.cards.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Ainda não há flashcards nesta classe.";
    cardsList.append(empty);
  }
  cardsPrevious.disabled = cardsOffset === 0;
  cardsNext.disabled = result.cards.length < PAGE_SIZE;
  cardsPage.textContent = `Página ${Math.floor(cardsOffset / PAGE_SIZE) + 1}`;
  return result;
}

async function loadPerformance() {
  const result = await request(classPath("/performance"));
  weeklyTotal.textContent = `${result.totalReviews} revisão(ões) nos últimos 7 dias.`;
  weeklyList.replaceChildren();
  for (const day of result.days) {
    const item = document.createElement("li");
    item.textContent = `${day.date}: ${day.total} revisão(ões) · errei ${day.ratings.errei}, difícil ${day.ratings.dificil}, bom ${day.ratings.bom}, fácil ${day.ratings.facil}`;
    weeklyList.append(item);
  }
}

async function loadClass(classId) {
  const selected = classes.find((item) => item.id === classId);
  if (!selected) return;
  const result = await request(`/api/classes/${classId}?limit=100`);
  currentClass = { ...selected, name: result.class.name };
  className.textContent = result.class.name;
  const address = new URL(window.location.href);
  address.searchParams.set("classId", classId);
  window.history.replaceState(null, "", address);
  for (const link of [forumLink, notesLink]) {
    const target = new URL(link.href);
    target.searchParams.set("classId", classId);
    link.href = target.href;
  }
  await Promise.all([
    loadDue(0),
    loadCards(0),
    loadPerformance(),
  ]);
  showFeedback(`Flashcards da classe ${result.class.name}.`);
}

classSelect.addEventListener("change", () => {
  void loadClass(classSelect.value).catch((error) => showFeedback(error.message, true));
});

duePrevious.addEventListener("click", () => {
  void loadDue(Math.max(0, dueOffset - PAGE_SIZE))
    .catch((error) => showFeedback(error.message, true));
});

dueNext.addEventListener("click", () => {
  void loadDue(dueOffset + PAGE_SIZE)
    .catch((error) => showFeedback(error.message, true));
});

cardsPrevious.addEventListener("click", () => {
  void loadCards(Math.max(0, cardsOffset - PAGE_SIZE))
    .catch((error) => showFeedback(error.message, true));
});

cardsNext.addEventListener("click", () => {
  void loadCards(cardsOffset + PAGE_SIZE)
    .catch((error) => showFeedback(error.message, true));
});

flashcardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentClass) return;
  createCardButton.disabled = true;
  try {
    await request(classPath(""), {
      method: "POST",
      body: JSON.stringify({
        question: questionInput.value,
        answer: answerInput.value,
      }),
    });
    flashcardForm.reset();
    await Promise.all([loadDue(0), loadCards(0)]);
    showFeedback("Flashcard criado.");
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    createCardButton.disabled = false;
  }
});

async function start() {
  try {
    const classResult = await request("/api/classes?limit=100");
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
      flashcardForm.hidden = true;
      createCardButton.disabled = true;
      showFeedback("Entre em uma classe antes de criar ou revisar flashcards.");
      return;
    }
    const requestedId = new URL(window.location.href).searchParams.get("classId");
    const initialClass = classes.find((item) => item.id === requestedId) ?? classes[0];
    classSelect.value = initialClass.id;
    await loadClass(initialClass.id);
  } catch (error) {
    classSelect.disabled = true;
    flashcardForm.hidden = true;
    createCardButton.disabled = true;
    showFeedback(error.message, true);
  }
}

start();

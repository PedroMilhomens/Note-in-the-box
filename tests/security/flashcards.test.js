import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";
import { testPool } from "../helpers/test-db.js";

async function postJson(origin, path, user, body) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: user.cookie,
      origin,
    },
    body: JSON.stringify(body),
  });
}

test("class flashcards are private to members and track individual review schedules", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Dona de Cartões Fictícia");
  const member = await createClassTestUser(testPool, "Membro de Cartões Fictício");
  const outsider = await createClassTestUser(testPool, "Visitante de Cartões Fictício");
  users.push(owner, member, outsider);
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
    rateLimiter: new RateLimiter({ limit: 100 }),
    logger: () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await cleanupClassFixtures(testPool, {
      userIds: users.map(({ id }) => id),
      classIds,
    });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const ownerClassResponse = await postJson(origin, "/api/classes", owner, {
    name: "Classe de Cartões Fictícia",
  });
  assert.equal(ownerClassResponse.status, 201);
  const ownerClass = await ownerClassResponse.json();
  classIds.push(ownerClass.class.id);
  const classId = ownerClass.class.id;

  const outsiderClassResponse = await postJson(origin, "/api/classes", outsider, {
    name: "Outra Classe de Cartões Fictícia",
  });
  assert.equal(outsiderClassResponse.status, 201);
  const outsiderClass = await outsiderClassResponse.json();
  classIds.push(outsiderClass.class.id);

  const joinResponse = await postJson(origin, "/api/classes/join", member, {
    inviteCode: ownerClass.inviteCode,
  });
  assert.equal(joinResponse.status, 200);

  const cardsPath = `/api/classes/${classId}/flashcards`;
  const noSession = await fetch(`${origin}${cardsPath}`);
  assert.equal(noSession.status, 401);
  const nonMember = await fetch(`${origin}${cardsPath}`, {
    headers: { cookie: outsider.cookie },
  });
  assert.equal(nonMember.status, 404);
  assert.doesNotMatch(await nonMember.text(), /Classe de Cartões Fictícia/u);

  const foreignNoteResponse = await postJson(
    origin,
    `/api/classes/${outsiderClass.class.id}/branches/${outsiderClass.branchId}/notes`,
    outsider,
    { title: "Nota de outra classe", body: "Texto fictício" },
  );
  assert.equal(foreignNoteResponse.status, 201);
  const foreignNote = (await foreignNoteResponse.json()).note;

  const crossClassCard = await postJson(origin, cardsPath, member, {
    question: "Pergunta fictícia",
    answer: "Resposta fictícia",
    noteId: foreignNote.id,
  });
  assert.equal(crossClassCard.status, 404);

  const noteResponse = await postJson(
    origin,
    `/api/classes/${classId}/branches/${ownerClass.branchId}/notes`,
    owner,
    { title: "Nota da classe", body: "Trecho selecionado fictício" },
  );
  assert.equal(noteResponse.status, 201);
  const note = (await noteResponse.json()).note;

  const invalidCard = await postJson(origin, cardsPath, member, {
    question: "Pergunta",
    answer: "Resposta",
    unexpected: true,
  });
  assert.equal(invalidCard.status, 400);

  const createCard = await postJson(origin, cardsPath, member, {
    question: "Pergunta <img src=x onerror=alert(1)>",
    answer: "Resposta <script>alert(1)</script>",
    noteId: note.id,
  });
  assert.equal(createCard.status, 201);
  const { card } = await createCard.json();
  assert.equal(card.question, "Pergunta <img src=x onerror=alert(1)>");
  assert.equal(card.answer, "Resposta <script>alert(1)</script>");
  assert.equal(card.noteId, note.id);

  const secondCardResponse = await postJson(origin, cardsPath, owner, {
    question: "Outra pergunta",
    answer: "Outra resposta",
  });
  assert.equal(secondCardResponse.status, 201);
  const secondCard = (await secondCardResponse.json()).card;

  const cards = await fetch(`${origin}${cardsPath}?limit=10`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(cards.status, 200);
  assert.equal((await cards.json()).cards.length, 2);

  const duePath = `${cardsPath}/due?limit=10`;
  const dueBeforeReview = await fetch(`${origin}${duePath}`, {
    headers: { cookie: member.cookie },
  });
  assert.equal(dueBeforeReview.status, 200);
  assert.deepEqual(
    new Set((await dueBeforeReview.json()).cards.map(({ id }) => id)),
    new Set([card.id, secondCard.id]),
  );

  const reviewPath = `/api/flashcards/${card.id}/review`;
  const noSessionReview = await fetch(`${origin}${reviewPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ rating: "errei" }),
  });
  assert.equal(noSessionReview.status, 401);
  const outsiderReview = await postJson(origin, reviewPath, outsider, {
    rating: "errei",
  });
  assert.equal(outsiderReview.status, 404);
  assert.doesNotMatch(await outsiderReview.text(), /Pergunta <img/u);

  const invalidRating = await postJson(origin, reviewPath, member, {
    rating: "talvez",
  });
  assert.equal(invalidRating.status, 400);

  const firstReview = await postJson(origin, reviewPath, member, {
    rating: "errei",
  });
  assert.equal(firstReview.status, 201);
  const firstReviewResult = (await firstReview.json()).review;
  assert.equal(firstReviewResult.rating, "errei");
  const firstInterval = new Date(firstReviewResult.nextDueAt)
    - new Date(firstReviewResult.reviewedAt);
  assert.ok(firstInterval >= 9 * 60 * 1000 && firstInterval <= 11 * 60 * 1000);

  const earlyReview = await postJson(origin, reviewPath, member, {
    rating: "facil",
  });
  assert.equal(earlyReview.status, 409);

  const dueAfterReview = await fetch(`${origin}${duePath}`, {
    headers: { cookie: member.cookie },
  });
  assert.deepEqual(
    (await dueAfterReview.json()).cards.map(({ id }) => id),
    [secondCard.id],
  );

  await testPool.query(
    `UPDATE flashcard_reviews
     SET reviewed_at = reviewed_at - interval '20 minutes',
         next_due_at = next_due_at - interval '20 minutes'
     WHERE card_id = $1 AND user_id = $2`,
    [card.id, member.id],
  );
  const nextReview = await postJson(origin, reviewPath, member, {
    rating: "bom",
  });
  assert.equal(nextReview.status, 201);
  const nextReviewResult = (await nextReview.json()).review;
  const nextInterval = new Date(nextReviewResult.nextDueAt)
    - new Date(nextReviewResult.reviewedAt);
  assert.ok(nextInterval >= 2 * 24 * 60 * 60 * 1000);

  const performance = await fetch(
    `${origin}${cardsPath}/performance`,
    { headers: { cookie: member.cookie } },
  );
  assert.equal(performance.status, 200);
  const weekly = await performance.json();
  assert.equal(weekly.totalReviews, 2);
  assert.equal(
    weekly.days.reduce((total, day) => total + day.total, 0),
    2,
  );

  const flashcardsScript = await fs.readFile(
    new URL("../../public/js/flashcards.js", import.meta.url),
    "utf8",
  );
  assert.match(flashcardsScript, /\.textContent\s*=/u);
  assert.doesNotMatch(
    flashcardsScript,
    /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/u,
  );
});

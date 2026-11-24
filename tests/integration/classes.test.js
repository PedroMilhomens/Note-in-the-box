import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";
import { testPool } from "../helpers/test-db.js";

async function listen(server, context) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("criar classe, convidar membro e criar uma branch por usuário", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Proprietário Fictício");
  const student = await createClassTestUser(testPool, "Estudante Fictício");
  users.push(owner, student);
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
    rateLimiter: new RateLimiter({ limit: 20 }),
    logger: () => {},
  });
  const origin = await listen(server, context);

  context.after(() => cleanupClassFixtures(testPool, {
    userIds: users.map(({ id }) => id),
    classIds,
  }));

  const unauthenticated = await fetch(`${origin}/api/classes`);
  assert.equal(unauthenticated.status, 401);

  const created = await fetch(`${origin}/api/classes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({
      name: "Biologia Fictícia",
      professorName: "Docente Fictício",
    }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  classIds.push(createdBody.class.id);
  assert.match(createdBody.inviteCode, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(typeof createdBody.branchId, "string");

  const storedCode = await testPool.query(
    "SELECT invite_code FROM classes WHERE id = $1",
    [createdBody.class.id],
  );
  assert.equal(storedCode.rows[0].invite_code, createdBody.inviteCode);
  assert.equal(storedCode.rows[0].invite_code.length, 43);

  const beforeJoin = await fetch(
    `${origin}/api/classes/${createdBody.class.id}`,
    { headers: { cookie: student.cookie } },
  );
  assert.equal(beforeJoin.status, 404);
  assert.doesNotMatch(await beforeJoin.text(), /Biologia Fictícia/);

  const joined = await fetch(`${origin}/api/classes/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: student.cookie,
      origin,
    },
    body: JSON.stringify({ inviteCode: createdBody.inviteCode }),
  });
  assert.equal(joined.status, 200);
  const joinedBody = await joined.json();
  assert.equal(joinedBody.class.id, createdBody.class.id);
  assert.notEqual(joinedBody.branchId, createdBody.branchId);

  const details = await fetch(
    `${origin}/api/classes/${createdBody.class.id}?limit=10`,
    { headers: { cookie: student.cookie } },
  );
  assert.equal(details.status, 200);
  const detailsBody = await details.json();
  assert.equal(detailsBody.class.name, "Biologia Fictícia");
  assert.equal(detailsBody.members.length, 2);
  assert.equal(detailsBody.branches.length, 2);
  for (const branch of detailsBody.branches) {
    assert.equal(branch.noteCount, 0);
    assert.equal(branch.lastNoteAt, null);
  }
  assert.equal(detailsBody.branches.some(
    (branch) => branch.id === joinedBody.branchId,
  ), true);
  assert.equal(JSON.stringify(detailsBody).includes(owner.email), false);
  assert.equal(JSON.stringify(detailsBody).includes(student.email), false);

  const duplicateJoin = await fetch(`${origin}/api/classes/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: student.cookie,
      origin,
    },
    body: JSON.stringify({ inviteCode: createdBody.inviteCode }),
  });
  assert.equal(duplicateJoin.status, 200);
  assert.equal((await duplicateJoin.json()).branchId, joinedBody.branchId);

  const ownClasses = await fetch(`${origin}/api/classes`, {
    headers: { cookie: student.cookie },
  });
  assert.equal(ownClasses.status, 200);
  const ownClassesBody = await ownClasses.json();
  assert.equal(ownClassesBody.classes.length, 1);
  assert.equal(ownClassesBody.classes[0].id, createdBody.class.id);
  assert.equal("inviteCode" in ownClassesBody.classes[0], false);
  assert.equal(ownClassesBody.classes[0].memberCount, 2);
  assert.equal(ownClassesBody.classes[0].branchCount, 2);
  assert.equal(ownClassesBody.classes[0].noteCount, 0);
  assert.equal(ownClassesBody.classes[0].dueFlashcards, 0);

  const card = await fetch(
    `${origin}/api/classes/${createdBody.class.id}/flashcards`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: student.cookie, origin },
      body: JSON.stringify({ question: "Pergunta fictícia?", answer: "Resposta fictícia." }),
    },
  );
  assert.equal(card.status, 201);
  const withCard = await (await fetch(`${origin}/api/classes`, {
    headers: { cookie: student.cookie },
  })).json();
  assert.equal(withCard.classes[0].dueFlashcards, 1);
  const otherView = await (await fetch(`${origin}/api/classes`, {
    headers: { cookie: owner.cookie },
  })).json();
  assert.equal(otherView.classes[0].dueFlashcards, 1, "cartões compartilhados vencem para cada membro");

  const invalidInvite = await fetch(`${origin}/api/classes/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: student.cookie,
      origin,
    },
    body: JSON.stringify({ inviteCode: "A".repeat(43) }),
  });
  assert.equal(invalidInvite.status, 404);

  const invalidPagination = await fetch(
    `${origin}/api/classes/${createdBody.class.id}?limit=500`,
    { headers: { cookie: student.cookie } },
  );
  assert.equal(invalidPagination.status, 400);
});

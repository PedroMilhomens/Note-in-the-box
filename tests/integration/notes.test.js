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

test("CRUD de notas cria versões e sugere notas para aulas perdidas", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Autor Fictício");
  const peer = await createClassTestUser(testPool, "Colega Fictícia");
  users.push(owner, peer);
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
    rateLimiter: new RateLimiter({ limit: 30 }),
    logger: () => {},
  });
  const origin = await listen(server, context);
  context.after(() => cleanupClassFixtures(testPool, {
    userIds: users.map(({ id }) => id),
    classIds,
  }));

  const createClassResponse = await fetch(`${origin}/api/classes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ name: "Química Fictícia" }),
  });
  assert.equal(createClassResponse.status, 201);
  const createdClass = await createClassResponse.json();
  classIds.push(createdClass.class.id);

  const joinResponse = await fetch(`${origin}/api/classes/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: peer.cookie,
      origin,
    },
    body: JSON.stringify({ inviteCode: createdClass.inviteCode }),
  });
  assert.equal(joinResponse.status, 200);
  const peerBranchId = (await joinResponse.json()).branchId;

  const api = `/api/classes/${createdClass.class.id}`;
  const peerNoteResponse = await fetch(
    `${origin}${api}/branches/${peerBranchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: peer.cookie,
        origin,
      },
      body: JSON.stringify({
        title: "Anotações da colega",
        body: "Conteúdo fictício da colega",
        lessonDate: "2000-01-02",
      }),
    },
  );
  assert.equal(peerNoteResponse.status, 201);
  const peerNote = (await peerNoteResponse.json()).note;

  const foreignClientId = await fetch(
    `${origin}/api/classes/${createdClass.class.id}/branches/${createdClass.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({
        title: "Colisão fictícia",
        clientId: peerNote.id,
      }),
    },
  );
  assert.equal(foreignClientId.status, 404);
  assert.equal(
    JSON.stringify(await foreignClientId.json()).includes("Conteúdo fictício da colega"),
    false,
  );

  const missedBefore = await fetch(`${origin}${api}/missed-lessons`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(missedBefore.status, 200);
  const missedBody = await missedBefore.json();
  assert.equal(missedBody.lessons.length, 1);
  assert.equal(missedBody.lessons[0].lessonDate, "2000-01-02");
  assert.equal(missedBody.lessons[0].suggestions[0].title, "Anotações da colega");
  assert.equal(JSON.stringify(missedBody).includes(owner.email), false);
  assert.equal(JSON.stringify(missedBody).includes(peer.email), false);

  const initialBody = "<img src=x onerror=alert(1)>";
  const offlineClientId = "d6743b8c-404a-4a46-8fa0-7f4581578f63";
  const createNoteResponse = await fetch(
    `${origin}${api}/branches/${createdClass.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({
        title: "Aula recuperada",
        body: initialBody,
        lessonDate: "2000-01-02",
        status: "draft",
        clientId: offlineClientId,
      }),
    },
  );
  assert.equal(createNoteResponse.status, 201);
  const createdNote = (await createNoteResponse.json()).note;
  assert.equal(createdNote.id, offlineClientId);
  assert.equal(createdNote.body, initialBody);

  const retriedCreate = await fetch(
    `${origin}${api}/branches/${createdClass.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({
        title: "Aula recuperada",
        body: initialBody,
        lessonDate: "2000-01-02",
        status: "draft",
        clientId: offlineClientId,
      }),
    },
  );
  assert.equal(retriedCreate.status, 200);
  assert.equal((await retriedCreate.json()).note.id, createdNote.id);

  const changedRetry = await fetch(
    `${origin}${api}/branches/${createdClass.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({
        title: "Aula recuperada",
        body: "Conteúdo local modificado durante a sincronização",
        lessonDate: "2000-01-02",
        status: "draft",
        clientId: offlineClientId,
      }),
    },
  );
  assert.equal(changedRetry.status, 409);
  assert.equal(
    (await changedRetry.json()).note.body,
    initialBody,
  );

  const versionsAfterCreate = await testPool.query(
    "SELECT body FROM note_versions WHERE note_id = $1 ORDER BY created_at, id",
    [createdNote.id],
  );
  assert.deepEqual(versionsAfterCreate.rows.map(({ body }) => body), [initialBody]);

  const peerRead = await fetch(`${origin}${api}/notes/${createdNote.id}`, {
    headers: { cookie: peer.cookie },
  });
  assert.equal(peerRead.status, 200);
  assert.equal((await peerRead.json()).note.body, initialBody);

  const updateResponse = await fetch(`${origin}${api}/notes/${createdNote.id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({
      body: "Versão atualizada",
      status: "complete",
      baseUpdatedAt: createdNote.updatedAt,
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updatedNote = (await updateResponse.json()).note;
  assert.equal(updatedNote.body, "Versão atualizada");

  const staleUpdate = await fetch(`${origin}${api}/notes/${createdNote.id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({
      body: "Versão offline desatualizada",
      baseUpdatedAt: createdNote.updatedAt,
    }),
  });
  assert.equal(staleUpdate.status, 409);
  const stalePayload = await staleUpdate.json();
  assert.equal(stalePayload.codigo, "CONFLITO_NOTA");
  assert.equal(stalePayload.note.body, "Versão atualizada");
  assert.equal(stalePayload.note.updatedAt, updatedNote.updatedAt);

  const versionsAfterUpdate = await testPool.query(
    "SELECT body FROM note_versions WHERE note_id = $1",
    [createdNote.id],
  );
  assert.equal(versionsAfterUpdate.rows.length, 2);
  assert.deepEqual(
    new Set(versionsAfterUpdate.rows.map(({ body }) => body)),
    new Set([initialBody, "Versão atualizada"]),
  );

  const missedAfter = await fetch(`${origin}${api}/missed-lessons`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal((await missedAfter.json()).lessons.length, 0);

  const listResponse = await fetch(
    `${origin}${api}/branches/${createdClass.branchId}/notes`,
    { headers: { cookie: peer.cookie } },
  );
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.equal(listBody.notes.length, 1);
  assert.equal("body" in listBody.notes[0], false);
  assert.equal(listBody.notes[0].referenceCount, 0);
  assert.equal(listBody.notes[0].commentCount, 0);

  const deleteResponse = await fetch(`${origin}${api}/notes/${createdNote.id}`, {
    method: "DELETE",
    headers: { cookie: owner.cookie, origin },
  });
  assert.equal(deleteResponse.status, 204);
  const deletedRead = await fetch(`${origin}${api}/notes/${createdNote.id}`, {
    headers: { cookie: peer.cookie },
  });
  assert.equal(deletedRead.status, 404);
});

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

async function createClass(origin, user, name) {
  const response = await fetch(`${origin}/api/classes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: user.cookie,
      origin,
    },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function createNote(origin, user, classId, branchId, title) {
  const response = await fetch(
    `${origin}/api/classes/${classId}/branches/${branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: user.cookie,
        origin,
      },
      body: JSON.stringify({ title, body: `Conteúdo de ${title}` }),
    },
  );
  assert.equal(response.status, 201);
  return (await response.json()).note;
}

test("referências e grafo ficam limitados a notas da mesma classe", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Dona de Notas Fictícia");
  const peer = await createClassTestUser(testPool, "Colega de Notas Fictícia");
  const outsider = await createClassTestUser(testPool, "Outro Membro Fictício");
  users.push(owner, peer, outsider);
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
    rateLimiter: new RateLimiter({ limit: 50 }),
    logger: () => {},
  });
  const origin = await listen(server, context);
  context.after(() => cleanupClassFixtures(testPool, {
    userIds: users.map(({ id }) => id),
    classIds,
  }));

  const ownerClass = await createClass(origin, owner, "Classe das Referências");
  const peerJoin = await fetch(`${origin}/api/classes/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: peer.cookie,
      origin,
    },
    body: JSON.stringify({ inviteCode: ownerClass.inviteCode }),
  });
  assert.equal(peerJoin.status, 200);
  const peerBranchId = (await peerJoin.json()).branchId;
  const otherClass = await createClass(origin, outsider, "Outra Classe");
  classIds.push(ownerClass.class.id, otherClass.class.id);

  const source = await createNote(
    origin,
    owner,
    ownerClass.class.id,
    ownerClass.branchId,
    "Nota de origem",
  );
  const target = await createNote(
    origin,
    peer,
    ownerClass.class.id,
    peerBranchId,
    "Nota de destino",
  );
  const ownBranchTarget = await createNote(
    origin,
    owner,
    ownerClass.class.id,
    ownerClass.branchId,
    "Nota na mesma branch",
  );
  const externalTarget = await createNote(
    origin,
    outsider,
    otherClass.class.id,
    otherClass.branchId,
    "Nota de outra classe",
  );
  const base = `/api/classes/${ownerClass.class.id}/notes/${source.id}`;

  const createdReference = await fetch(`${origin}${base}/references`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ targetNoteId: target.id }),
  });
  assert.equal(createdReference.status, 201);
  assert.equal((await createdReference.json()).reference.noteId, target.id);

  const duplicateReference = await fetch(`${origin}${base}/references`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ targetNoteId: target.id }),
  });
  assert.equal(duplicateReference.status, 200);

  const listedReferences = await fetch(`${origin}${base}/references`, {
    headers: { cookie: peer.cookie },
  });
  assert.equal(listedReferences.status, 200);
  const referenceBody = await listedReferences.json();
  assert.equal(referenceBody.references.length, 1);
  assert.equal(referenceBody.references[0].title, "Nota de destino");
  assert.equal(JSON.stringify(referenceBody).includes(peer.email), false);

  const candidates = await fetch(
    `${origin}/api/classes/${ownerClass.class.id}/reference-candidates?noteId=${source.id}&limit=100`,
    { headers: { cookie: owner.cookie } },
  );
  assert.equal(candidates.status, 200);
  const candidateBody = await candidates.json();
  assert.equal(candidateBody.candidates.some(({ id }) => id === target.id), true);
  assert.equal(candidateBody.candidates.some(({ id }) => id === source.id), false);
  assert.equal(candidateBody.candidates.some(({ id }) => id === ownBranchTarget.id), false);
  assert.equal(candidateBody.candidates.some(({ id }) => id === externalTarget.id), false);

  const graph = await fetch(
    `${origin}/api/classes/${ownerClass.class.id}/graph?noteId=${source.id}`,
    { headers: { cookie: owner.cookie } },
  );
  assert.equal(graph.status, 200);
  const graphBody = await graph.json();
  assert.equal(graphBody.nodes.length, 2);
  assert.equal(graphBody.edges.length, 1);
  assert.equal(graphBody.edges[0].fromNoteId, source.id);
  assert.equal(graphBody.edges[0].toNoteId, target.id);
  assert.equal(JSON.stringify(graphBody).includes(owner.email), false);

  const sameBranchReference = await fetch(`${origin}${base}/references`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ targetNoteId: ownBranchTarget.id }),
  });
  assert.equal(sameBranchReference.status, 400);

  const crossClassReference = await fetch(`${origin}${base}/references`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ targetNoteId: externalTarget.id }),
  });
  assert.equal(crossClassReference.status, 404);
  assert.doesNotMatch(await crossClassReference.text(), /Nota de outra classe/);

  const peerCannotManageSource = await fetch(`${origin}${base}/references`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: peer.cookie,
      origin,
    },
    body: JSON.stringify({ targetNoteId: source.id }),
  });
  assert.equal(peerCannotManageSource.status, 403);

  const removed = await fetch(
    `${origin}${base}/references/${target.id}`,
    { method: "DELETE", headers: { cookie: owner.cookie, origin } },
  );
  assert.equal(removed.status, 204);
  const emptyGraph = await fetch(
    `${origin}/api/classes/${ownerClass.class.id}/graph?noteId=${source.id}`,
    { headers: { cookie: owner.cookie } },
  );
  assert.equal((await emptyGraph.json()).edges.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";
import { testPool } from "../helpers/test-db.js";

test("rede de notas exige login e associação à classe em cada rota", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Proprietário de Rede Fictício");
  const outsider = await createClassTestUser(testPool, "Não Membro de Rede Fictício");
  users.push(owner, outsider);
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
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

  const creation = await fetch(`${origin}/api/classes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ name: "Rede Privada Fictícia" }),
  });
  assert.equal(creation.status, 201);
  const created = await creation.json();
  classIds.push(created.class.id);
  const noteResponse = await fetch(
    `${origin}/api/classes/${created.class.id}/branches/${created.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({ title: "Nó confidencial fictício" }),
    },
  );
  assert.equal(noteResponse.status, 201);
  const note = (await noteResponse.json()).note;

  const paths = [
    `/api/classes/${created.class.id}/notes/${note.id}/references`,
    `/api/classes/${created.class.id}/reference-candidates?noteId=${note.id}`,
    `/api/classes/${created.class.id}/graph?noteId=${note.id}`,
  ];
  for (const path of paths) {
    const anonymous = await fetch(`${origin}${path}`);
    assert.equal(anonymous.status, 401);
    const nonMember = await fetch(`${origin}${path}`, {
      headers: { cookie: outsider.cookie },
    });
    const privateBody = await nonMember.text();
    assert.equal(nonMember.status, 404);
    assert.doesNotMatch(privateBody, /Nó confidencial fictício/);
  }

  const sourceReferenceUrl =
    `${origin}/api/classes/${created.class.id}/notes/${note.id}/references`;
  const targetNoteId = "99999999-9999-4999-8999-999999999999";
  const anonymousCreate = await fetch(sourceReferenceUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ targetNoteId }),
  });
  assert.equal(anonymousCreate.status, 401);
  const nonMemberCreate = await fetch(sourceReferenceUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: outsider.cookie,
      origin,
    },
    body: JSON.stringify({ targetNoteId }),
  });
  assert.equal(nonMemberCreate.status, 404);
  assert.doesNotMatch(await nonMemberCreate.text(), /Nó confidencial fictício/);

  const deletePath = `${sourceReferenceUrl}/${targetNoteId}`;
  const anonymousDelete = await fetch(deletePath, {
    method: "DELETE",
    headers: { origin },
  });
  assert.equal(anonymousDelete.status, 401);
  const nonMemberDelete = await fetch(deletePath, {
    method: "DELETE",
    headers: { cookie: outsider.cookie, origin },
  });
  assert.equal(nonMemberDelete.status, 404);

  const otherClassGraph = await fetch(
    `${origin}/api/classes/00000000-0000-4000-8000-000000000001/graph?noteId=${note.id}`,
    { headers: { cookie: owner.cookie } },
  );
  assert.equal(otherClassGraph.status, 404);
  assert.doesNotMatch(await otherClassGraph.text(), /Nó confidencial fictício/);
});

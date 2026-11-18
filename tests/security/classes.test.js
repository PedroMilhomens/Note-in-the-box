import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";
import { testPool } from "../helpers/test-db.js";

test("somente membros leem detalhes de classe; respostas não expõem dados", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Dono Fictício");
  const stranger = await createClassTestUser(testPool, "Não Membro Fictício");
  users.push(owner, stranger);
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
    body: JSON.stringify({ name: "Classe Confidencial Fictícia" }),
  });
  assert.equal(creation.status, 201);
  const created = await creation.json();
  classIds.push(created.class.id);

  const noSession = await fetch(
    `${origin}/api/classes/${created.class.id}`,
  );
  assert.equal(noSession.status, 401);

  const noMembership = await fetch(
    `${origin}/api/classes/${created.class.id}`,
    { headers: { cookie: stranger.cookie } },
  );
  const privateBody = await noMembership.text();
  assert.equal(noMembership.status, 404);
  assert.doesNotMatch(privateBody, /Classe Confidencial Fictícia/);
  assert.doesNotMatch(privateBody, new RegExp(owner.email));
  assert.doesNotMatch(privateBody, new RegExp(stranger.email));

  const ownerView = await fetch(
    `${origin}/api/classes/${created.class.id}`,
    { headers: { cookie: owner.cookie } },
  );
  assert.equal(ownerView.status, 200);
  assert.equal((await ownerView.json()).class.name, "Classe Confidencial Fictícia");
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";
import { testPool } from "../helpers/test-db.js";

test("notas respeitam sessão, associação à classe e posse da branch", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Dona Fictícia");
  const member = await createClassTestUser(testPool, "Membro Fictício");
  const outsider = await createClassTestUser(testPool, "Visitante Fictício");
  users.push(owner, member, outsider);
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
    body: JSON.stringify({ name: "Classe Privada Fictícia" }),
  });
  assert.equal(creation.status, 201);
  const created = await creation.json();
  classIds.push(created.class.id);

  const join = await fetch(`${origin}/api/classes/join`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: member.cookie,
      origin,
    },
    body: JSON.stringify({ inviteCode: created.inviteCode }),
  });
  assert.equal(join.status, 200);
  const memberBranch = (await join.json()).branchId;
  const base = `/api/classes/${created.class.id}`;

  const noteResponse = await fetch(
    `${origin}${base}/branches/${created.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({
        title: "Conteúdo Confidencial Fictício",
        body: "<script>alert(1)</script>",
      }),
    },
  );
  assert.equal(noteResponse.status, 201);
  const note = (await noteResponse.json()).note;
  const noteUrl = `${origin}${base}/notes/${note.id}`;

  const anonymousRead = await fetch(noteUrl);
  assert.equal(anonymousRead.status, 401);
  const anonymousWrite = await fetch(noteUrl, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ body: "intrusão" }),
  });
  assert.equal(anonymousWrite.status, 401);

  const outsiderRead = await fetch(noteUrl, {
    headers: { cookie: outsider.cookie },
  });
  const outsiderBody = await outsiderRead.text();
  assert.equal(outsiderRead.status, 404);
  assert.doesNotMatch(outsiderBody, /Conteúdo Confidencial Fictício/);
  assert.doesNotMatch(outsiderBody, /<script>/);

  const memberRead = await fetch(noteUrl, {
    headers: { cookie: member.cookie },
  });
  assert.equal(memberRead.status, 200);
  assert.equal((await memberRead.json()).note.body, "<script>alert(1)</script>");

  const memberUpdate = await fetch(noteUrl, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: member.cookie,
      origin,
    },
    body: JSON.stringify({ body: "alteração indevida" }),
  });
  assert.equal(memberUpdate.status, 403);
  assert.doesNotMatch(await memberUpdate.text(), /Conteúdo Confidencial Fictício/);

  const memberDelete = await fetch(noteUrl, {
    method: "DELETE",
    headers: { cookie: member.cookie, origin },
  });
  assert.equal(memberDelete.status, 403);

  const wrongBranch = await fetch(
    `${origin}${base}/branches/${created.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: member.cookie,
        origin,
      },
      body: JSON.stringify({ title: "Não deve ser criado" }),
    },
  );
  assert.equal(wrongBranch.status, 403);

  const wrongClass = await fetch(
    `${origin}/api/classes/${created.class.id}/notes/${note.id}`,
    { headers: { cookie: outsider.cookie } },
  );
  assert.equal(wrongClass.status, 404);

  const lerJs = (arquivo) => fs.readFile(
    new URL(`../../public/js/${arquivo}`, import.meta.url),
    "utf8",
  );
  const notesScript = await lerJs("views/anotacao.js");
  const arquivosDaNota = [
    "views/anotacao.js", "components/nota/painel.js", "components/nota/corpo-view.js",
    "components/nota/dialogo.js", "nota/corpo.js", "nota/modelo.js",
  ];
  assert.match(notesScript, /from "\.\.\/components\/dom\.js"/u);
  assert.match(await lerJs("components/dom.js"), /createElementNS/u);
  assert.ok(notesScript.includes("[[${alvo.title}]]"));
  for (const arquivo of arquivosDaNota) {
    assert.doesNotMatch(
      await lerJs(arquivo),
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/u,
    );
  }
  assert.equal(memberBranch === created.branchId, false);
});

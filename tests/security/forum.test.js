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

test("forum class topics, replies, rules, moderation, and reports are scoped", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Dono do Fórum Fictício");
  const member = await createClassTestUser(testPool, "Membro do Fórum Fictício");
  const outsider = await createClassTestUser(testPool, "Visitante do Fórum Fictício");
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
    await testPool.query(
      "DELETE FROM reports WHERE reporter_id = ANY($1::uuid[])",
      [users.map(({ id }) => id)],
    );
    await cleanupClassFixtures(testPool, {
      userIds: users.map(({ id }) => id),
      classIds,
    });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const createdClassResponse = await postJson(origin, "/api/classes", owner, {
    name: "Classe do Fórum Fictícia",
  });
  assert.equal(createdClassResponse.status, 201);
  const createdClass = await createdClassResponse.json();
  classIds.push(createdClass.class.id);
  const classId = createdClass.class.id;

  const outsideClassResponse = await postJson(origin, "/api/classes", outsider, {
    name: "Outra Classe Fictícia",
  });
  assert.equal(outsideClassResponse.status, 201);
  const outsideClass = await outsideClassResponse.json();
  classIds.push(outsideClass.class.id);

  const join = await postJson(origin, "/api/classes/join", member, {
    inviteCode: createdClass.inviteCode,
  });
  assert.equal(join.status, 200);
  const joined = await join.json();
  const classDetailsPath = `/api/classes/${classId}`;
  const topicsPath = `${classDetailsPath}/forum/topics`;

  const noSessionTopics = await fetch(`${origin}${topicsPath}`);
  assert.equal(noSessionTopics.status, 401);
  const outsiderTopics = await fetch(`${origin}${topicsPath}`, {
    headers: { cookie: outsider.cookie },
  });
  assert.equal(outsiderTopics.status, 404);
  assert.doesNotMatch(await outsiderTopics.text(), /Classe do Fórum Fictícia/u);

  const updateRules = await fetch(`${origin}${classDetailsPath}/rules`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({
      rules: "Seja respeitoso.\nNão compartilhe provas ou dados pessoais.",
    }),
  });
  assert.equal(updateRules.status, 200);
  assert.equal(
    (await updateRules.json()).class.rules,
    "Seja respeitoso.\nNão compartilhe provas ou dados pessoais.",
  );

  const memberRulesUpdate = await fetch(`${origin}${classDetailsPath}/rules`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: member.cookie,
      origin,
    },
    body: JSON.stringify({ rules: "Regra alterada indevidamente" }),
  });
  assert.equal(memberRulesUpdate.status, 403);
  const classDetails = await fetch(`${origin}${classDetailsPath}`, {
    headers: { cookie: member.cookie },
  });
  assert.equal(
    (await classDetails.json()).class.rules,
    "Seja respeitoso.\nNão compartilhe provas ou dados pessoais.",
  );

  const otherClassNote = await postJson(
    origin,
    `/api/classes/${outsideClass.class.id}/branches/${outsideClass.branchId}/notes`,
    outsider,
    { title: "Nota fora da classe", body: "Conteúdo fictício" },
  );
  assert.equal(otherClassNote.status, 201);
  const foreignNoteId = (await otherClassNote.json()).note.id;

  const classNote = await postJson(
    origin,
    `/api/classes/${classId}/branches/${createdClass.branchId}/notes`,
    owner,
    { title: "Nota de referência fictícia", body: "Conteúdo fictício" },
  );
  assert.equal(classNote.status, 201);
  const noteId = (await classNote.json()).note.id;

  const foreignNoteTopic = await postJson(origin, topicsPath, member, {
    title: "Referência inválida",
    body: "A nota é de outra classe.",
    noteId: foreignNoteId,
  });
  assert.equal(foreignNoteTopic.status, 404);
  assert.doesNotMatch(await foreignNoteTopic.text(), /Nota fora da classe/u);

  const createTopic = await postJson(origin, topicsPath, member, {
    title: "Dúvida <img src=x onerror=alert(1)>",
    body: "Corpo do tópico <script>alert(1)</script>",
    noteId,
  });
  assert.equal(createTopic.status, 201);
  const { topic } = await createTopic.json();
  assert.equal(topic.title, "Dúvida <img src=x onerror=alert(1)>");
  assert.equal(topic.body, "Corpo do tópico <script>alert(1)</script>");
  assert.equal(topic.noteId, noteId);

  const topicList = await fetch(`${origin}${topicsPath}?limit=10`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(topicList.status, 200);
  const listedTopics = (await topicList.json()).topics;
  assert.equal(listedTopics.length, 1);
  assert.equal(listedTopics[0].noteTitle, "Nota de referência fictícia");
  assert.equal(listedTopics[0].authorName, member.name);

  const postsPath = `${topicsPath}/${topic.id}/posts`;
  const replyResponse = await postJson(origin, postsPath, member, {
    body: "Resposta <img src=x onerror=alert(1)>",
  });
  assert.equal(replyResponse.status, 201);
  const { post } = await replyResponse.json();
  assert.equal(post.authorId, member.id);
  assert.equal(post.body, "Resposta <img src=x onerror=alert(1)>");

  const ownerReplyResponse = await postJson(origin, postsPath, owner, {
    body: "Resposta do proprietário",
  });
  assert.equal(ownerReplyResponse.status, 201);
  const ownerReply = (await ownerReplyResponse.json()).post;
  const memberCannotDeleteOwnerReply = await fetch(
    `${origin}${postsPath}/${ownerReply.id}`,
    {
      method: "DELETE",
      headers: { cookie: member.cookie, origin },
    },
  );
  assert.equal(memberCannotDeleteOwnerReply.status, 403);

  const postReport = await postJson(
    origin,
    `${classDetailsPath}/reports`,
    owner,
    {
      targetType: "post",
      targetId: post.id,
      reason: "Resposta fictícia para análise",
    },
  );
  assert.equal(postReport.status, 201);
  assert.equal((await postReport.json()).report.targetType, "post");
  const topicReport = await postJson(
    origin,
    `${classDetailsPath}/reports`,
    owner,
    {
      targetType: "topic",
      targetId: topic.id,
      reason: "Tópico fictício para análise",
    },
  );
  assert.equal(topicReport.status, 201);
  assert.equal((await topicReport.json()).report.targetType, "topic");

  const ownerDeletesReply = await fetch(`${origin}${postsPath}/${post.id}`, {
    method: "DELETE",
    headers: { cookie: owner.cookie, origin },
  });
  assert.equal(ownerDeletesReply.status, 204);
  const authorDeletesOwnReply = await fetch(
    `${origin}${postsPath}/${ownerReply.id}`,
    {
      method: "DELETE",
      headers: { cookie: owner.cookie, origin },
    },
  );
  assert.equal(authorDeletesOwnReply.status, 204);

  const anotherTopicResponse = await postJson(origin, topicsPath, member, {
    title: "Tópico removido pelo autor",
    body: "Conteúdo fictício",
  });
  const anotherTopic = (await anotherTopicResponse.json()).topic;
  const authorDeletesOwnTopic = await fetch(
    `${origin}${topicsPath}/${anotherTopic.id}`,
    {
      method: "DELETE",
      headers: { cookie: member.cookie, origin },
    },
  );
  assert.equal(authorDeletesOwnTopic.status, 204);

  const ownerModeratesTopic = await fetch(`${origin}${topicsPath}/${topic.id}`, {
    method: "DELETE",
    headers: { cookie: owner.cookie, origin },
  });
  assert.equal(ownerModeratesTopic.status, 204);
  const deletedTopicPosts = await fetch(`${origin}${postsPath}`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(deletedTopicPosts.status, 404);

  const forumScript = await fs.readFile(
    new URL("../../public/js/forum.js", import.meta.url),
    "utf8",
  );
  assert.match(forumScript, /\.textContent\s*=/u);
  assert.doesNotMatch(
    forumScript,
    /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/u,
  );
  assert.equal(joined.branchId === createdClass.branchId, false);
});

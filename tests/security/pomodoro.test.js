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
      ...(user ? { cookie: user.cookie } : {}),
      origin,
    },
    body: JSON.stringify(body),
  });
}

test("Pomodoro session logging requires login, valid completion, and class membership", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Dona de Pomodoro Fictícia");
  const member = await createClassTestUser(testPool, "Membro de Pomodoro Fictício");
  const outsider = await createClassTestUser(testPool, "Visitante de Pomodoro Fictício");
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
  const noSession = await postJson(origin, "/api/pomodoro/sessions", null, {
    kind: "foco",
    startedAt: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
    durationS: 25 * 60,
    completed: true,
    classId: null,
  });
  assert.equal(noSession.status, 401);

  const classResponse = await postJson(origin, "/api/classes", owner, {
    name: "Classe de Pomodoro Fictícia",
  });
  assert.equal(classResponse.status, 201);
  const createdClass = await classResponse.json();
  classIds.push(createdClass.class.id);
  const classId = createdClass.class.id;

  const join = await postJson(origin, "/api/classes/join", member, {
    inviteCode: createdClass.inviteCode,
  });
  assert.equal(join.status, 200);

  const outsiderClassResponse = await postJson(origin, "/api/classes", outsider, {
    name: "Outra Classe de Pomodoro Fictícia",
  });
  assert.equal(outsiderClassResponse.status, 201);
  const outsiderClass = await outsiderClassResponse.json();
  classIds.push(outsiderClass.class.id);

  const unelapsed = await postJson(origin, "/api/pomodoro/sessions", member, {
    kind: "foco",
    startedAt: new Date(Date.now() - 10_000).toISOString(),
    durationS: 25 * 60,
    completed: true,
    classId,
  });
  assert.equal(unelapsed.status, 400);

  const nonMember = await postJson(origin, "/api/pomodoro/sessions", outsider, {
    kind: "foco",
    startedAt: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
    durationS: 25 * 60,
    completed: true,
    classId,
  });
  assert.equal(nonMember.status, 404);
  assert.doesNotMatch(await nonMember.text(), /Classe de Pomodoro Fictícia/u);

  const completedFocus = await postJson(origin, "/api/pomodoro/sessions", member, {
    kind: "foco",
    startedAt: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
    durationS: 25 * 60,
    completed: true,
    classId,
  });
  assert.equal(completedFocus.status, 201);
  const focusSession = (await completedFocus.json()).session;
  assert.equal(focusSession.kind, "foco");
  assert.equal(focusSession.classId, classId);
  assert.equal(focusSession.durationS, 25 * 60);
  assert.equal(focusSession.completed, true);

  const completedBreak = await postJson(origin, "/api/pomodoro/sessions", member, {
    kind: "pausa",
    startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    durationS: 5 * 60,
    completed: true,
    classId: null,
  });
  assert.equal(completedBreak.status, 201);
  assert.equal((await completedBreak.json()).session.classId, null);

  const stored = await testPool.query(
    `SELECT class_id, kind, duration_s, completed
     FROM pomodoro_sessions
     WHERE user_id = $1
     ORDER BY started_at`,
    [member.id],
  );
  assert.equal(stored.rowCount, 2);
  assert.equal(stored.rows[0].class_id, classId);
  assert.equal(stored.rows[1].class_id, null);

  const lerJs = (arquivo) => fs.readFile(
    new URL(`../../public/js/${arquivo}`, import.meta.url),
    "utf8",
  );
  const timerScript = await lerJs("foco/instancia.js");
  assert.match(timerScript, /body: "Seu ciclo de estudo terminou\."/u);
  for (const arquivo of ["foco/instancia.js", "foco/timer.js", "views/foco.js"]) {
    assert.doesNotMatch(
      await lerJs(arquivo),
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval|localStorage|sessionStorage)\b/u,
    );
  }
});

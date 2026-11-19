import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { createServer } from "../../src/server/index.js";
import { testPool } from "../helpers/test-db.js";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";
import { purgeExpiredAccounts } from "../../src/server/modules/privacy/service.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";

after(() => testPool.end());

function cookieOf(response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";", 1)[0];
}

test("titular exporta, corrige, revoga consentimento e exclui a conta", async (context) => {
  const owner = await createClassTestUser(testPool, "Titular Fictício");
  const peer = await createClassTestUser(testPool, "Colega Fictício");
  const logs = [];
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), "privacy-uploads-"));
  const attachmentKey = `${randomUUID()}.pdf`;
  const attachmentBytes = Buffer.from("%PDF-1.7 conteúdo fictício");
  await fs.writeFile(path.join(uploadRoot, attachmentKey), attachmentBytes, {
    mode: 0o600,
  });
  let classId;
  let ownerBranchId;
  let peerBranchId;
  let ownNoteId;
  let peerNoteId;
  let commentId;
  let topicId;
  let postId;
  let flashcardId;
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
    logger: (entry) => logs.push(entry),
    uploadRoot,
    rateLimiter: new RateLimiter({ limit: 20 }),
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  context.after(async () => {
    await testPool.query(
      "DELETE FROM reports WHERE reporter_id = ANY($1::uuid[])",
      [[owner.id, peer.id]],
    );
    if (classId) {
      await testPool.query("DELETE FROM classes WHERE id = $1", [classId]);
    }
    await cleanupClassFixtures(testPool, {
      userIds: [owner.id, peer.id],
      classIds: [],
    });
    await fs.rm(uploadRoot, { recursive: true, force: true });
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  const protectedRequests = await Promise.all([
    fetch(`${origin}/api/me/consents`),
    fetch(`${origin}/api/me/export`),
    fetch(`${origin}/api/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ name: "Sem sessão" }),
    }),
    fetch(`${origin}/api/me/consents`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ kind: "privacidade" }),
    }),
    fetch(`${origin}/api/me`, {
      method: "DELETE",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ confirmation: "EXCLUIR" }),
    }),
  ]);
  assert.deepEqual(
    protectedRequests.map((response) => response.status),
    [401, 401, 401, 401, 401],
  );

  const classResult = await testPool.query(
    `INSERT INTO classes (name, invite_code, created_by)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["Classe Fictícia", randomUUID(), owner.id],
  );
  classId = classResult.rows[0].id;
  await testPool.query(
    `INSERT INTO class_members (class_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
    [classId, owner.id, peer.id],
  );
  const branches = await testPool.query(
    `INSERT INTO branches (class_id, owner_id)
     VALUES ($1, $2), ($1, $3)
     RETURNING id, owner_id`,
    [classId, owner.id, peer.id],
  );
  ownerBranchId = branches.rows.find((row) => row.owner_id === owner.id).id;
  peerBranchId = branches.rows.find((row) => row.owner_id === peer.id).id;

  const notes = await testPool.query(
    `INSERT INTO notes (branch_id, title, body)
     VALUES ($1, $2, $3), ($4, $5, $6)
     RETURNING id, branch_id`,
    [
      ownerBranchId,
      "Nota do titular",
      "Conteúdo do titular",
      peerBranchId,
      "Nota da colega",
      "Conteúdo da colega",
    ],
  );
  ownNoteId = notes.rows.find((row) => row.branch_id === ownerBranchId).id;
  peerNoteId = notes.rows.find((row) => row.branch_id === peerBranchId).id;
  await testPool.query(
    `INSERT INTO attachments
       (note_id, filename, mime_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      ownNoteId,
      "material-ficticio.pdf",
      "application/pdf",
      attachmentBytes.length,
      attachmentKey,
    ],
  );
  await testPool.query(
    "INSERT INTO note_versions (note_id, body) VALUES ($1, $2), ($3, $4)",
    [ownNoteId, "Versão do titular", peerNoteId, "Versão da colega"],
  );
  const comment = await testPool.query(
    `INSERT INTO comments (note_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [peerNoteId, owner.id, "Comentário do titular"],
  );
  commentId = comment.rows[0].id;
  await testPool.query(
    "INSERT INTO comments (note_id, author_id, body) VALUES ($1, $2, $3)",
    [ownNoteId, peer.id, "Comentário da colega"],
  );
  const topic = await testPool.query(
    `INSERT INTO forum_topics (class_id, author_id, title, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [classId, owner.id, "Tópico do titular", "Texto do titular"],
  );
  topicId = topic.rows[0].id;
  const post = await testPool.query(
    `INSERT INTO forum_posts (topic_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [topicId, owner.id, "Resposta do titular"],
  );
  postId = post.rows[0].id;
  const flashcard = await testPool.query(
    `INSERT INTO flashcards (class_id, owner_id, note_id, question, answer)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [classId, owner.id, ownNoteId, "Pergunta fictícia", "Resposta fictícia"],
  );
  flashcardId = flashcard.rows[0].id;
  await testPool.query(
    `INSERT INTO flashcard_reviews (card_id, user_id, rating, next_due_at)
     VALUES ($1, $2, 'bom', now())`,
    [flashcardId, owner.id],
  );
  await testPool.query(
    `INSERT INTO pomodoro_sessions
       (user_id, class_id, kind, started_at, duration_s, completed)
     VALUES ($1, $2, 'foco', now(), 1500, true)`,
    [owner.id, classId],
  );
  await testPool.query(
    `INSERT INTO consents (user_id, kind, version)
     VALUES ($1, 'termos', 'terms-v1'), ($1, 'privacidade', 'privacy-v1')`,
    [owner.id],
  );
  await testPool.query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason)
     VALUES ($1, 'note', $2, $3)`,
    [owner.id, peerNoteId, "Motivo fictício"],
  );

  const headers = { cookie: owner.cookie };
  const invalidProfile = await fetch(`${origin}/api/me`, {
    method: "PATCH",
    headers: {
      ...headers,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ name: " " }),
  });
  assert.equal(invalidProfile.status, 400);

  const unconfirmedDeletion = await fetch(`${origin}/api/me`, {
    method: "DELETE",
    headers: {
      ...headers,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ confirmation: "APAGAR" }),
  });
  assert.equal(unconfirmedDeletion.status, 400);
  assert.equal((await fetch(`${origin}/api/me`, { headers })).status, 200);

  const exportResponse = await fetch(`${origin}/api/me/export`, { headers });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-disposition"), /attachment/u);
  const exported = await exportResponse.json();
  assert.equal(exported.profile.email, owner.email);
  assert.equal(exported.notes.length, 1);
  assert.equal(exported.notes[0].id, ownNoteId);
  assert.equal(exported.noteVersions.length, 1);
  assert.equal(exported.comments.length, 1);
  assert.equal(exported.comments[0].id, commentId);
  assert.equal(exported.forumTopics[0].id, topicId);
  assert.equal(exported.forumPosts[0].id, postId);
  assert.equal(exported.flashcards[0].id, flashcardId);
  assert.equal(exported.flashcardReviews.length, 1);
  assert.equal(exported.pomodoroSessions.length, 1);
  assert.equal(exported.consents.length, 2);
  assert.equal(exported.attachments.length, 1);
  assert.equal(
    exported.attachments[0].contentBase64,
    attachmentBytes.toString("base64"),
  );
  assert.equal(Object.hasOwn(exported.attachments[0], "storageKey"), false);
  const serializedExport = JSON.stringify(exported);
  assert.equal(serializedExport.includes(peer.email), false);
  assert.equal(serializedExport.includes("Colega Fictício"), false);
  assert.equal(serializedExport.includes("Conteúdo da colega"), false);
  assert.equal(serializedExport.includes("password_hash"), false);
  assert.equal(serializedExport.includes(owner.cookie), false);

  const duplicateEmail = await fetch(`${origin}/api/me`, {
    method: "PATCH",
    headers: {
      ...headers,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ email: peer.email }),
  });
  assert.equal(duplicateEmail.status, 409);

  const profileUpdate = await fetch(`${origin}/api/me`, {
    method: "PATCH",
    headers: {
      ...headers,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      name: "Titular Corrigido",
      email: `corrigido-${randomUUID()}@example.test`,
      institution: "Instituição Fictícia",
      course: null,
    }),
  });
  assert.equal(profileUpdate.status, 200);
  assert.equal((await profileUpdate.json()).user.name, "Titular Corrigido");

  const revoke = await fetch(`${origin}/api/me/consents`, {
    method: "PATCH",
    headers: {
      ...headers,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ kind: "privacidade" }),
  });
  assert.equal(revoke.status, 200);
  assert.ok((await revoke.json()).consent.revokedAt);

  const deletion = await fetch(`${origin}/api/me`, {
    method: "DELETE",
    headers: {
      ...headers,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ confirmation: "EXCLUIR" }),
  });
  assert.equal(deletion.status, 200);
  assert.match(deletion.headers.get("set-cookie"), /Max-Age=0/u);
  assert.equal(
    (await fetch(`${origin}/api/me`, { headers })).status,
    401,
  );
  assert.equal(
    (await fetch(`${origin}/api/me`, { headers: { cookie: peer.cookie } })).status,
    200,
  );

  const anonymized = await testPool.query(
    `SELECT name, email, institution, course, deleted_at
     FROM users WHERE id = $1`,
    [owner.id],
  );
  assert.deepEqual(anonymized.rows[0], {
    name: "Usuário removido",
    email: `removed+${owner.id}@invalid.example`,
    institution: null,
    course: null,
    deleted_at: anonymized.rows[0].deleted_at,
  });
  assert.ok(anonymized.rows[0].deleted_at);
  const sessions = await testPool.query(
    "SELECT count(*)::int AS count FROM sessions WHERE user_id = $1",
    [owner.id],
  );
  assert.equal(sessions.rows[0].count, 0);
  const memberships = await testPool.query(
    "SELECT role FROM class_members WHERE class_id = $1 AND user_id = $2",
    [classId, owner.id],
  );
  assert.equal(memberships.rowCount, 0);
  const promotedPeer = await testPool.query(
    "SELECT role FROM class_members WHERE class_id = $1 AND user_id = $2",
    [classId, peer.id],
  );
  assert.equal(promotedPeer.rows[0].role, "owner");
  const authorship = await testPool.query(
    `SELECT
       (SELECT author_id FROM comments WHERE id = $1) AS comment_author,
       (SELECT author_id FROM forum_topics WHERE id = $2) AS topic_author,
       (SELECT author_id FROM forum_posts WHERE id = $3) AS post_author`,
    [commentId, topicId, postId],
  );
  assert.deepEqual(authorship.rows[0], {
    comment_author: null,
    topic_author: null,
    post_author: null,
  });
  const retainedNote = await testPool.query(
    "SELECT id FROM notes WHERE id = $1",
    [ownNoteId],
  );
  assert.equal(retainedNote.rowCount, 1);
  const retainedFlashcard = await testPool.query(
    "SELECT id FROM flashcards WHERE id = $1",
    [flashcardId],
  );
  assert.equal(retainedFlashcard.rowCount, 1);
  const privateData = await testPool.query(
    `SELECT
       (SELECT count(*)::int FROM consents WHERE user_id = $1) AS consents,
       (SELECT count(*)::int FROM pomodoro_sessions WHERE user_id = $1) AS pomodoro,
       (SELECT count(*)::int FROM flashcard_reviews WHERE user_id = $1) AS reviews,
       (SELECT count(*)::int FROM reports WHERE reporter_id = $1) AS reports`,
    [owner.id],
  );
  assert.deepEqual(privateData.rows[0], {
    consents: 0,
    pomodoro: 0,
    reviews: 0,
    reports: 0,
  });
  assert.equal(JSON.stringify(logs).includes(owner.email), false);
});

test("rotina de retenção só remove contas anonimizadas anteriores ao corte e seus anexos", async (context) => {
  const expired = await createClassTestUser(testPool, "Conta expirada fictícia");
  const recent = await createClassTestUser(testPool, "Conta recente fictícia");
  const classRows = await testPool.query(
    `INSERT INTO classes (name, invite_code)
     VALUES ($1, $2), ($3, $4)
     RETURNING id`,
    [
      "Classe expirada fictícia",
      randomUUID(),
      "Classe recente fictícia",
      randomUUID(),
    ],
  );
  const [expiredClassId, recentClassId] = classRows.rows.map((row) => row.id);
  const branches = await testPool.query(
    `INSERT INTO branches (class_id, owner_id)
     VALUES ($1, $2), ($3, $4)
     RETURNING id, owner_id`,
    [expiredClassId, expired.id, recentClassId, recent.id],
  );
  const expiredBranch = branches.rows.find((row) => row.owner_id === expired.id);
  const oldNote = await testPool.query(
    `INSERT INTO notes (branch_id, title, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [expiredBranch.id, "Nota expirada fictícia", "Conteúdo expirado fictício"],
  );
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), "retention-uploads-"));
  const storageKey = `${randomUUID()}.pdf`;
  await fs.writeFile(path.join(uploadRoot, storageKey), "%PDF-1.7", { mode: 0o600 });
  context.after(async () => {
    await testPool.query(
      "DELETE FROM classes WHERE id = ANY($1::uuid[])",
      [[expiredClassId, recentClassId]],
    );
    await cleanupClassFixtures(testPool, {
      userIds: [expired.id, recent.id],
      classIds: [],
    });
    await fs.rm(uploadRoot, { recursive: true, force: true });
  });
  await testPool.query(
    `INSERT INTO attachments
       (note_id, filename, mime_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [oldNote.rows[0].id, "antigo-ficticio.pdf", "application/pdf", 8, storageKey],
  );
  await testPool.query(
    `UPDATE users
     SET name = 'Usuário removido', email = $2, institution = NULL,
         course = NULL, deleted_at = $3
     WHERE id = $1`,
    [expired.id, `removed+${expired.id}@invalid.example`, "2020-01-01T00:00:00Z"],
  );
  await testPool.query(
    `UPDATE users
     SET name = 'Usuário removido', email = $2, institution = NULL,
         course = NULL, deleted_at = $3
     WHERE id = $1`,
    [recent.id, `removed+${recent.id}@invalid.example`, "2026-01-01T00:00:00Z"],
  );
  await testPool.query(
    "DELETE FROM sessions WHERE user_id = ANY($1::uuid[])",
    [[expired.id, recent.id]],
  );
  await testPool.query(
    "UPDATE classes SET created_by = NULL WHERE created_by = ANY($1::uuid[])",
    [[expired.id, recent.id]],
  );
  await testPool.query(
    "DELETE FROM class_members WHERE user_id = ANY($1::uuid[])",
    [[expired.id, recent.id]],
  );

  const result = await purgeExpiredAccounts(testPool, {
    cutoff: new Date("2025-01-01T00:00:00Z"),
    uploadRoot,
    staticRoot: path.resolve("public"),
  });
  assert.deepEqual(result, { accountsDeleted: 1, attachmentsDeleted: 1 });
  await assert.rejects(fs.access(path.join(uploadRoot, storageKey)), {
    code: "ENOENT",
  });
  const deletedUser = await testPool.query(
    "SELECT 1 FROM users WHERE id = $1",
    [expired.id],
  );
  const recentUser = await testPool.query(
    "SELECT 1 FROM users WHERE id = $1",
    [recent.id],
  );
  assert.equal(deletedUser.rowCount, 0);
  assert.equal(recentUser.rowCount, 1);
});

test("rotina de retenção rejeita cortes inválidos e futuros", async () => {
  await assert.rejects(
    purgeExpiredAccounts(testPool, {
      cutoff: "data-inválida",
      uploadRoot: "/tmp",
      staticRoot: path.resolve("public"),
    }),
    /RETENTION_CUTOFF/u,
  );
  await assert.rejects(
    purgeExpiredAccounts(testPool, {
      cutoff: new Date(Date.now() + 60_000),
      uploadRoot: "/tmp",
      staticRoot: path.resolve("public"),
    }),
    /RETENTION_CUTOFF/u,
  );
});

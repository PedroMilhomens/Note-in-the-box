import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";
import {
  cleanupClassFixtures,
  createClassTestUser,
} from "../helpers/class-fixtures.js";
import { testPool } from "../helpers/test-db.js";

test("comentários, anexos privados e denúncias respeitam permissões", async (context) => {
  const users = [];
  const classIds = [];
  const owner = await createClassTestUser(testPool, "Autora Fictícia");
  const commenter = await createClassTestUser(testPool, "Comentadora Fictícia");
  const otherMember = await createClassTestUser(testPool, "Membro Fictício");
  const outsider = await createClassTestUser(testPool, "Visitante Fictício");
  users.push(owner, commenter, otherMember, outsider);
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), "note-uploads-"));
  const server = createServer({
    pool: testPool,
    uploadRoot,
    nodeEnv: "test",
    appOrigin: null,
    rateLimiter: new RateLimiter({ limit: 50 }),
    logger: () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if (users.length > 0) {
      await testPool.query(
        "DELETE FROM reports WHERE reporter_id = ANY($1::uuid[])",
        [users.map(({ id }) => id)],
      );
    }
    await cleanupClassFixtures(testPool, {
      userIds: users.map(({ id }) => id),
      classIds,
    });
    await fs.rm(uploadRoot, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const createClass = await fetch(`${origin}/api/classes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({ name: "Classe de colaboração fictícia" }),
  });
  assert.equal(createClass.status, 201);
  const createdClass = await createClass.json();
  classIds.push(createdClass.class.id);
  const classId = createdClass.class.id;

  for (const user of [commenter, otherMember]) {
    const join = await fetch(`${origin}/api/classes/join`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: user.cookie,
        origin,
      },
      body: JSON.stringify({ inviteCode: createdClass.inviteCode }),
    });
    assert.equal(join.status, 200);
  }

  const createNote = await fetch(
    `${origin}/api/classes/${classId}/branches/${createdClass.branchId}/notes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin,
      },
      body: JSON.stringify({ title: "Nota para colaboração", body: "Texto fictício" }),
    },
  );
  assert.equal(createNote.status, 201);
  const { note } = await createNote.json();
  const notePath = `/api/classes/${classId}/notes/${note.id}`;

  const commentResponse = await fetch(`${origin}${notePath}/comments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: commenter.cookie,
      origin,
    },
    body: JSON.stringify({ body: "<img src=x onerror=alert(1)>" }),
  });
  assert.equal(commentResponse.status, 201);
  const { comment } = await commentResponse.json();
  assert.equal(comment.authorId, commenter.id);
  assert.equal(comment.authorName, commenter.name);
  assert.equal(comment.body, "<img src=x onerror=alert(1)>");

  const commentReport = await fetch(`${origin}/api/classes/${classId}/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: owner.cookie,
      origin,
    },
    body: JSON.stringify({
      targetType: "comment",
      targetId: comment.id,
      reason: "Comentário fictício para revisão",
    }),
  });
  assert.equal(commentReport.status, 201);
  assert.equal((await commentReport.json()).report.targetType, "comment");

  const listComments = await fetch(`${origin}${notePath}/comments`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(listComments.status, 200);
  assert.equal((await listComments.json()).comments[0].body, comment.body);

  const unauthorizedDelete = await fetch(
    `${origin}${notePath}/comments/${comment.id}`,
    {
      method: "DELETE",
      headers: { cookie: otherMember.cookie, origin },
    },
  );
  assert.equal(unauthorizedDelete.status, 403);
  const ownerDelete = await fetch(`${origin}${notePath}/comments/${comment.id}`, {
    method: "DELETE",
    headers: { cookie: owner.cookie, origin },
  });
  assert.equal(ownerDelete.status, 204);

  const ownCommentResponse = await fetch(`${origin}${notePath}/comments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: commenter.cookie,
      origin,
    },
    body: JSON.stringify({ body: "Comentário removido pelo próprio autor" }),
  });
  const { comment: ownComment } = await ownCommentResponse.json();
  const authorDelete = await fetch(
    `${origin}${notePath}/comments/${ownComment.id}`,
    {
      method: "DELETE",
      headers: { cookie: commenter.cookie, origin },
    },
  );
  assert.equal(authorDelete.status, 204);

  const uploadPath = `${origin}${notePath}/attachments`;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
  const uploaded = await fetch(uploadPath, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-file-name": encodeURIComponent("../aula-á.png"),
      cookie: owner.cookie,
      origin,
    },
    body: png,
  });
  assert.equal(uploaded.status, 201);
  const { attachment } = await uploaded.json();
  assert.equal(attachment.filename, "../aula-á.png");
  assert.equal(attachment.mimeType, "image/png");
  const storedNames = await fs.readdir(uploadRoot);
  assert.equal(storedNames.length, 1);
  assert.match(storedNames[0], /^[0-9a-f-]{36}\.png$/u);
  assert.deepEqual(await fs.readFile(path.join(uploadRoot, storedNames[0])), png);

  const download = await fetch(
    `${origin}/api/classes/${classId}/attachments/${attachment.id}/download`,
    { headers: { cookie: commenter.cookie } },
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "image/png");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.equal(download.headers.get("cache-control"), "no-store");
  assert.match(download.headers.get("content-disposition"), /attachment/u);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);

  const peerDeleteAttachment = await fetch(
    `${origin}/api/classes/${classId}/attachments/${attachment.id}`,
    {
      method: "DELETE",
      headers: { cookie: commenter.cookie, origin },
    },
  );
  assert.equal(peerDeleteAttachment.status, 403);

  const outsiderDownload = await fetch(
    `${origin}/api/classes/${classId}/attachments/${attachment.id}/download`,
    { headers: { cookie: outsider.cookie } },
  );
  assert.equal(outsiderDownload.status, 404);

  const peerUpload = await fetch(uploadPath, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-file-name": "peer.png",
      cookie: commenter.cookie,
      origin,
    },
    body: png,
  });
  assert.equal(peerUpload.status, 403);

  const disguisedHtml = await fetch(uploadPath, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-file-name": "picture.png",
      cookie: owner.cookie,
      origin,
    },
    body: Buffer.from("<html>not an image</html>"),
  });
  assert.equal(disguisedHtml.status, 415);

  const oversized = await fetch(uploadPath, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-file-name": "large.png",
      cookie: owner.cookie,
      origin,
    },
    body: Buffer.alloc(5 * 1024 * 1024 + 1, 0),
  });
  assert.equal(oversized.status, 413);

  for (let index = 2; index <= 5; index += 1) {
    const additionalUpload = await fetch(uploadPath, {
      method: "POST",
      headers: {
        "content-type": "image/png",
        "x-file-name": `lecture-${index}.png`,
        cookie: owner.cookie,
        origin,
      },
      body: png,
    });
    assert.equal(additionalUpload.status, 201);
  }
  const overQuantityLimit = await fetch(uploadPath, {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-file-name": "sixth.png",
      cookie: owner.cookie,
      origin,
    },
    body: png,
  });
  assert.equal(overQuantityLimit.status, 409);

  const reportResponse = await fetch(`${origin}/api/classes/${classId}/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: commenter.cookie,
      origin,
    },
    body: JSON.stringify({
      targetType: "note",
      targetId: note.id,
      reason: "Conteúdo fictício para revisão",
    }),
  });
  assert.equal(reportResponse.status, 201);
  const { report } = await reportResponse.json();
  assert.equal(report.targetType, "note");
  const savedReports = await testPool.query(
    "SELECT target_type, target_id FROM reports WHERE id = $1",
    [report.id],
  );
  assert.deepEqual(savedReports.rows[0], {
    target_type: "note",
    target_id: note.id,
  });

  const attachmentList = await fetch(`${origin}${notePath}/attachments`, {
    headers: { cookie: owner.cookie },
  });
  const { attachments } = await attachmentList.json();
  assert.equal(attachments.length, 5);
  for (const item of attachments) {
    const deleteAttachmentResponse = await fetch(
      `${origin}/api/classes/${classId}/attachments/${item.id}`,
      {
        method: "DELETE",
        headers: { cookie: owner.cookie, origin },
      },
    );
    assert.equal(deleteAttachmentResponse.status, 204);
  }
  assert.deepEqual(await fs.readdir(uploadRoot), []);
});

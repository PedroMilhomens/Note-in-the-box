import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../http/errors.js";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_NOTE = 5;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:pdf|png|jpg|webp)$/u;
const MIME_TYPES = new Map([
  ["application/pdf", { extension: "pdf", signature: (bytes) =>
    bytes.subarray(0, 5).toString("ascii") === "%PDF-" }],
  ["image/png", { extension: "png", signature: (bytes) =>
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ["image/jpeg", { extension: "jpg", signature: (bytes) =>
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ["image/webp", { extension: "webp", signature: (bytes) =>
    bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WEBP" }],
]);

export function isStorageKey(value) {
  return typeof value === "string" && STORAGE_KEY_PATTERN.test(value);
}

export function validateAttachment({ bytes, mimeType }) {
  const type = MIME_TYPES.get(mimeType);
  if (!type) {
    throw new HttpError(415, "TIPO_DE_ARQUIVO_INVALIDO", "tipo de arquivo não permitido");
  }
  if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_SIZE) {
    throw new HttpError(413, "ARQUIVO_INVALIDO", "arquivo vazio ou acima do limite de 5 MB");
  }
  if (!type.signature(bytes)) {
    throw new HttpError(415, "TIPO_DE_ARQUIVO_INVALIDO", "o conteúdo não corresponde ao tipo informado");
  }
  return { extension: type.extension, mimeType };
}

export async function resolvePrivateUploadRoot(uploadRoot, staticRoot, { create = false } = {}) {
  if (create) {
    await fs.mkdir(uploadRoot, { recursive: true, mode: 0o700 });
  }
  const [realUploadRoot, realStaticRoot] = await Promise.all([
    fs.realpath(uploadRoot),
    fs.realpath(staticRoot),
  ]);
  if (
    realUploadRoot === realStaticRoot
    || realUploadRoot.startsWith(`${realStaticRoot}${path.sep}`)
  ) {
    throw new Error("O armazenamento de anexos deve ficar fora da pasta estática");
  }
  return realUploadRoot;
}

function mapComment(row) {
  return {
    id: row.id,
    noteId: row.note_id,
    authorId: row.author_id,
    authorName: row.author_name ?? "Usuário removido",
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export async function listComments(pool, classId, noteId, { limit, offset }) {
  const result = await pool.query(
    `SELECT c.id, c.note_id, c.author_id, u.name AS author_name,
            c.body, c.created_at
     FROM comments c
     JOIN notes n ON n.id = c.note_id
     JOIN branches b ON b.id = n.branch_id
     LEFT JOIN users u ON u.id = c.author_id
     WHERE n.id = $1 AND b.class_id = $2
       AND n.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY c.created_at, c.id
     LIMIT $3 OFFSET $4`,
    [noteId, classId, limit, offset],
  );
  return result.rows.map(mapComment);
}

export async function noteExists(pool, classId, noteId) {
  const result = await pool.query(
    `SELECT 1
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL`,
    [noteId, classId],
  );
  return result.rowCount > 0;
}

export async function createComment(pool, {
  classId,
  noteId,
  authorId,
  body,
}) {
  const result = await pool.query(
    `INSERT INTO comments (note_id, author_id, body)
     SELECT n.id, $3, $4
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
     RETURNING id, note_id, author_id, body, created_at`,
    [noteId, classId, authorId, body],
  );
  if (result.rowCount === 0) return null;
  const comment = result.rows[0];
  const author = await pool.query(
    "SELECT name FROM users WHERE id = $1",
    [authorId],
  );
  return mapComment({ ...comment, author_name: author.rows[0]?.name });
}

export async function deleteComment(pool, {
  classId,
  noteId,
  commentId,
  userId,
}) {
  const result = await pool.query(
    `UPDATE comments c
     SET deleted_at = now()
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     WHERE c.id = $1 AND c.note_id = $2 AND n.id = $2
       AND b.class_id = $3 AND n.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND (
         c.author_id = $4
         OR b.owner_id = $4
       )
     RETURNING c.id`,
    [commentId, noteId, classId, userId],
  );
  if (result.rowCount > 0) return "ok";
  const exists = await pool.query(
    `SELECT 1
     FROM comments c
     JOIN notes n ON n.id = c.note_id
     JOIN branches b ON b.id = n.branch_id
     WHERE c.id = $1 AND c.note_id = $2
       AND b.class_id = $3 AND n.deleted_at IS NULL
       AND c.deleted_at IS NULL`,
    [commentId, noteId, classId],
  );
  return exists.rowCount > 0 ? "forbidden" : "not_found";
}

export async function listAttachments(pool, classId, noteId) {
  const result = await pool.query(
    `SELECT a.id, a.filename, a.mime_type, a.size_bytes, a.created_at
     FROM attachments a
     JOIN notes n ON n.id = a.note_id
     JOIN branches b ON b.id = n.branch_id
     WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
     ORDER BY a.created_at, a.id`,
    [noteId, classId],
  );
  return result.rows.map(mapAttachment);
}

export async function createAttachment(pool, {
  classId,
  noteId,
  userId,
  filename,
  bytes,
  mimeType,
  uploadRoot,
  staticRoot,
}) {
  const { extension } = validateAttachment({ bytes, mimeType });
  const client = await pool.connect();
  let storagePath;
  try {
    await client.query("BEGIN");
    const noteResult = await client.query(
      `SELECT b.owner_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR UPDATE OF n`,
      [noteId, classId],
    );
    const note = noteResult.rows[0];
    if (!note) {
      await client.query("ROLLBACK");
      return { result: "not_found" };
    }
    if (note.owner_id !== userId) {
      await client.query("ROLLBACK");
      return { result: "forbidden" };
    }
    const countResult = await client.query(
      "SELECT count(*)::int AS count FROM attachments WHERE note_id = $1",
      [noteId],
    );
    if (countResult.rows[0].count >= MAX_ATTACHMENTS_PER_NOTE) {
      throw new HttpError(409, "LIMITE_DE_ANEXOS", "a nota já atingiu o limite de 5 anexos");
    }

    const privateRoot = await resolvePrivateUploadRoot(
      uploadRoot,
      staticRoot,
      { create: true },
    );
    const storageKey = `${randomUUID()}.${extension}`;
    storagePath = path.join(privateRoot, storageKey);
    await fs.writeFile(storagePath, bytes, { flag: "wx", mode: 0o600 });
    const attachmentResult = await client.query(
      `INSERT INTO attachments (note_id, filename, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, mime_type, size_bytes, created_at`,
      [noteId, filename, mimeType, bytes.length, storageKey],
    );
    await client.query("COMMIT");
    return { result: "ok", attachment: mapAttachment(attachmentResult.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK");
    if (storagePath) {
      try {
        await fs.unlink(storagePath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") throw cleanupError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getAttachment(pool, classId, attachmentId) {
  const result = await pool.query(
    `SELECT a.id, a.filename, a.mime_type, a.size_bytes, a.storage_key
     FROM attachments a
     JOIN notes n ON n.id = a.note_id
     JOIN branches b ON b.id = n.branch_id
     WHERE a.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL`,
    [attachmentId, classId],
  );
  return result.rows[0] ? {
    id: result.rows[0].id,
    filename: result.rows[0].filename,
    mimeType: result.rows[0].mime_type,
    sizeBytes: result.rows[0].size_bytes,
    storageKey: isStorageKey(result.rows[0].storage_key)
      ? result.rows[0].storage_key
      : null,
  } : null;
}

export async function deleteAttachment(pool, {
  classId,
  attachmentId,
  userId,
}) {
  const result = await pool.query(
    `DELETE FROM attachments a
     USING notes n, branches b
     WHERE a.id = $1 AND n.id = a.note_id AND b.id = n.branch_id
       AND b.class_id = $2 AND n.deleted_at IS NULL AND b.owner_id = $3
     RETURNING a.storage_key`,
    [attachmentId, classId, userId],
  );
  if (result.rowCount > 0) return { result: "ok", storageKey: result.rows[0].storage_key };
  const exists = await pool.query(
    `SELECT 1
     FROM attachments a
     JOIN notes n ON n.id = a.note_id
     JOIN branches b ON b.id = n.branch_id
     WHERE a.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL`,
    [attachmentId, classId],
  );
  return { result: exists.rowCount > 0 ? "forbidden" : "not_found" };
}

export async function createReport(pool, {
  classId,
  reporterId,
  targetType,
  targetId,
  reason,
}) {
  const targetQueries = {
    note: `SELECT 1 FROM notes n JOIN branches b ON b.id = n.branch_id
           WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL`,
    comment: `SELECT 1 FROM comments c JOIN notes n ON n.id = c.note_id
              JOIN branches b ON b.id = n.branch_id
              WHERE c.id = $1 AND b.class_id = $2
                AND c.deleted_at IS NULL AND n.deleted_at IS NULL`,
    topic: `SELECT 1 FROM forum_topics
            WHERE id = $1 AND class_id = $2 AND deleted_at IS NULL`,
    post: `SELECT 1 FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id
           WHERE p.id = $1 AND t.class_id = $2
             AND p.deleted_at IS NULL AND t.deleted_at IS NULL`,
  };
  const targetResult = await pool.query(targetQueries[targetType], [targetId, classId]);
  if (targetResult.rowCount === 0) return null;
  const result = await pool.query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING id, target_type, target_id, status, created_at`,
    [reporterId, targetType, targetId, reason],
  );
  const report = result.rows[0];
  return {
    id: report.id,
    targetType: report.target_type,
    targetId: report.target_id,
    status: report.status,
    createdAt: report.created_at,
  };
}

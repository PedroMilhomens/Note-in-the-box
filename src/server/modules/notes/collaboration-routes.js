import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { json } from "../../http/json.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { exigirMembro } from "../classes/exigir-membro.js";
import { parseNotesPagination } from "./routes.js";
import {
  createAttachment,
  createComment,
  createReport,
  deleteAttachment,
  deleteComment,
  getAttachment,
  isStorageKey,
  listAttachments,
  listComments,
  noteExists,
  resolvePrivateUploadRoot,
  validateAttachment,
} from "./collaboration-service.js";

const MAX_FILENAME_LENGTH = 255;
const MAX_COMMENT_LENGTH = 5000;
const BODY_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const REPORT_TARGET_TYPES = new Set(["note", "comment", "topic", "post"]);
const REPORT_REASON_LENGTH = 1000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

function ensureIds(params, ...ids) {
  if (![params.classId, ...ids].every(isUuid)) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
}

function getPagination(request) {
  return parseNotesPagination(new URL(request.url ?? "/", "http://localhost").search);
}

function parseComment(body) {
  if (
    !isRecord(body)
    || Object.keys(body).length !== 1
    || typeof body.body !== "string"
  ) {
    throw new HttpError(400, "DADOS_INVALIDOS", "comentário inválido");
  }
  const comment = body.body.trim();
  if (
    !comment
    || comment.length > MAX_COMMENT_LENGTH
    || BODY_CONTROL_CHARACTERS.test(comment)
  ) {
    throw new HttpError(400, "DADOS_INVALIDOS", "comentário vazio ou acima de 5000 caracteres");
  }
  return comment;
}

function parseReport(body) {
  if (
    !isRecord(body)
    || Object.keys(body).some((key) => !["targetType", "targetId", "reason"].includes(key))
    || !REPORT_TARGET_TYPES.has(body.targetType)
    || !isUuid(body.targetId)
    || typeof body.reason !== "string"
  ) {
    throw new HttpError(400, "DADOS_INVALIDOS", "denúncia inválida");
  }
  const reason = body.reason.trim();
  if (
    !reason
    || reason.length > REPORT_REASON_LENGTH
    || BODY_CONTROL_CHARACTERS.test(reason)
  ) {
    throw new HttpError(400, "DADOS_INVALIDOS", "motivo vazio ou acima de 1000 caracteres");
  }
  return { targetType: body.targetType, targetId: body.targetId, reason };
}

function parseUploadMetadata(request) {
  const mimeType = request.headers["content-type"]?.trim().toLowerCase();
  const encodedFilename = request.headers["x-file-name"];
  let filename;
  try {
    filename = typeof encodedFilename === "string"
      ? decodeURIComponent(encodedFilename)
      : "";
  } catch {
    throw new HttpError(400, "DADOS_INVALIDOS", "nome de arquivo inválido");
  }
  if (
    !filename.trim()
    || filename.length > MAX_FILENAME_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(filename)
  ) {
    throw new HttpError(400, "DADOS_INVALIDOS", "nome de arquivo inválido");
  }
  if (!mimeType) {
    throw new HttpError(415, "TIPO_DE_ARQUIVO_INVALIDO", "tipo de arquivo não permitido");
  }
  return { filename: filename.trim(), mimeType };
}

function contentDisposition(filename) {
  const fallback = filename
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/["\\]/gu, "_")
    .replace(/[\r\n]/gu, "_")
    .slice(0, MAX_FILENAME_LENGTH) || "anexo";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function registerNoteCollaborationRoutes(router, {
  pool,
  uploadRoot = path.resolve("uploads"),
  staticRoot = path.resolve("public"),
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para comentários e anexos");

  router.add(
    "GET",
    "/api/classes/:classId/notes/:noteId/comments",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      if (!await noteExists(pool, params.classId, params.noteId)) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      json(response, 200, {
        comments: await listComments(
          pool,
          params.classId,
          params.noteId,
          getPagination(request),
        ),
      });
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/notes/:noteId/comments",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const body = parseComment(await context.readJson());
      const comment = await createComment(pool, {
        classId: params.classId,
        noteId: params.noteId,
        authorId: auth.user.id,
        body,
      });
      if (!comment) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      json(response, 201, { comment });
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId/notes/:noteId/comments/:commentId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId, params.commentId);
      const result = await deleteComment(pool, {
        classId: params.classId,
        noteId: params.noteId,
        commentId: params.commentId,
        userId: auth.user.id,
      });
      if (result === "not_found") {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      if (result === "forbidden") {
        throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
      }
      response.writeHead(204);
      response.end();
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/notes/:noteId/attachments",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      if (!await noteExists(pool, params.classId, params.noteId)) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      json(response, 200, {
        attachments: await listAttachments(pool, params.classId, params.noteId),
      });
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/notes/:noteId/attachments",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const { filename, mimeType } = parseUploadMetadata(request);
      const bytes = await context.readBody({ limit: 5 * 1024 * 1024 });
      validateAttachment({ bytes, mimeType });
      const result = await createAttachment(pool, {
        classId: params.classId,
        noteId: params.noteId,
        userId: auth.user.id,
        filename,
        bytes,
        mimeType,
        uploadRoot,
        staticRoot,
      });
      if (result.result === "not_found") {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      if (result.result === "forbidden") {
        throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
      }
      json(response, 201, { attachment: result.attachment });
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/attachments/:attachmentId/download",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.attachmentId);
      const attachment = await getAttachment(pool, params.classId, params.attachmentId);
      if (!attachment) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      if (!attachment.storageKey) throw new Error("Chave de armazenamento inválida");
      let privateRoot;
      try {
        privateRoot = await resolvePrivateUploadRoot(uploadRoot, staticRoot);
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
        }
        throw error;
      }
      const storagePath = path.join(privateRoot, attachment.storageKey);
      let bytes;
      try {
        bytes = await fs.readFile(storagePath);
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
        }
        throw error;
      }
      response.writeHead(200, {
        "content-type": attachment.mimeType,
        "content-length": bytes.length,
        "content-disposition": contentDisposition(attachment.filename),
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      });
      response.end(bytes);
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId/attachments/:attachmentId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.attachmentId);
      const result = await deleteAttachment(pool, {
        classId: params.classId,
        attachmentId: params.attachmentId,
        userId: auth.user.id,
      });
      if (result.result === "not_found") {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      if (result.result === "forbidden") {
        throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
      }
      if (!isStorageKey(result.storageKey)) {
        throw new Error("Chave de armazenamento inválida");
      }
      try {
        await fs.unlink(path.join(uploadRoot, result.storageKey));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      response.writeHead(204);
      response.end();
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/reports",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const report = await createReport(pool, {
        classId: params.classId,
        reporterId: auth.user.id,
        ...parseReport(await context.readJson()),
      });
      if (!report) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      json(response, 201, { report });
    },
  );
}

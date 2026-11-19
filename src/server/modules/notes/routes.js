import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { json } from "../../http/json.js";
import { requireLogin } from "../../middleware/require-login.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { exigirMembro } from "../classes/exigir-membro.js";
import {
  createNote,
  deleteNote,
  getBranchNotes,
  getMissedLessons,
  getNote,
  updateNote,
} from "./service.js";

const NOTE_STATUSES = new Set(["draft", "complete", "incomplete"]);
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 200_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;
const TITLE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const BODY_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidNoteInput() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados da nota inválidos");
}

function validLessonDate(value) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  if (value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateNoteFields(body, { partial = false } = {}) {
  if (!isRecord(body)) invalidNoteInput();
  const allowedFields = new Set([
    "title",
    "body",
    "lessonDate",
    "status",
    ...(partial ? ["baseUpdatedAt"] : []),
    ...(!partial ? ["clientId"] : []),
  ]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    invalidNoteInput();
  }
  const hasEditableField = ["title", "body", "lessonDate", "status"]
    .some((key) => Object.hasOwn(body, key));
  if (partial && !hasEditableField) invalidNoteInput();

  const fields = {};
  if (!partial || Object.hasOwn(body, "title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (
      !title
      || title.length > MAX_TITLE_LENGTH
      || TITLE_CONTROL_CHARACTERS.test(title)
    ) {
      invalidNoteInput();
    }
    fields.title = title;
  }
  if (!partial || Object.hasOwn(body, "body")) {
    const noteBody = Object.hasOwn(body, "body") ? body.body : "";
    if (
      typeof noteBody !== "string"
      || noteBody.length > MAX_BODY_LENGTH
      || BODY_CONTROL_CHARACTERS.test(noteBody)
    ) {
      invalidNoteInput();
    }
    fields.body = noteBody;
  }
  if (!partial || Object.hasOwn(body, "lessonDate")) {
    const lessonDate = body.lessonDate ?? null;
    if (!validLessonDate(lessonDate)) invalidNoteInput();
    fields.lessonDate = lessonDate;
  }
  if (!partial || Object.hasOwn(body, "status")) {
    const status = Object.hasOwn(body, "status") ? body.status : "draft";
    if (!NOTE_STATUSES.has(status)) invalidNoteInput();
    fields.status = status;
  }
  if (partial && Object.hasOwn(body, "baseUpdatedAt")) {
    const updatedAt = body.baseUpdatedAt;
    if (
      typeof updatedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(updatedAt)
      || Number.isNaN(Date.parse(updatedAt))
      || new Date(updatedAt).toISOString() !== updatedAt
    ) {
      invalidNoteInput();
    }
    fields.baseUpdatedAt = updatedAt;
  }
  if (!partial && Object.hasOwn(body, "clientId")) {
    if (!isUuid(body.clientId)) invalidNoteInput();
    fields.clientId = body.clientId;
  }
  return fields;
}

export function parseNoteInput(body) {
  return validateNoteFields(body);
}

export function parseNotePatch(body) {
  return validateNoteFields(body, { partial: true });
}

function paginationValue(value, fallback, maximum) {
  if (value === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function parseNotesPagination(search) {
  const params = new URLSearchParams(search);
  const limit = paginationValue(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = paginationValue(params.get("offset"), 0, MAX_OFFSET);
  if (limit === null || limit < 1 || offset === null) {
    throw new HttpError(400, "PAGINACAO_INVALIDA", "paginação inválida");
  }
  return { limit, offset };
}

function getPagination(request) {
  return parseNotesPagination(new URL(request.url ?? "/", "http://localhost").search);
}

function ensureIds(params, ...ids) {
  if (![params.classId, ...ids].every(isUuid)) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

export function registerNoteRoutes(router, {
  pool,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para notas");

  router.add(
    "GET",
    "/api/classes/:classId/missed-lessons",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      const result = await getMissedLessons(
        pool,
        params.classId,
        auth.user.id,
        getPagination(request),
      );
      json(response, 200, result);
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/branches/:branchId/notes",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.branchId);
      const result = await getBranchNotes(
        pool,
        params.classId,
        params.branchId,
        getPagination(request),
      );
      json(response, 200, result);
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/branches/:branchId/notes",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.branchId);
      rateLimiter.consume(clientAddress(request), null);
      const { clientId, ...values } = parseNoteInput(await context.readJson());
      const result = await createNote(pool, {
        classId: params.classId,
        branchId: params.branchId,
        userId: auth.user.id,
        clientId,
        ...values,
      });
      if (result.result === "conflict") {
        json(response, 409, {
          erro: "a nota foi atualizada em outro lugar",
          codigo: "CONFLITO_NOTA",
          note: result.note,
        });
        return;
      }
      json(response, result.duplicate ? 200 : 201, { note: result.note });
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/notes/:noteId",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      json(response, 200, {
        note: await getNote(pool, params.classId, params.noteId),
      });
    },
  );

  router.add(
    "PATCH",
    "/api/classes/:classId/notes/:noteId",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      const { baseUpdatedAt, ...fields } = parseNotePatch(
        await context.readJson(),
      );
      const result = await updateNote(pool, {
        classId: params.classId,
        noteId: params.noteId,
        userId: auth.user.id,
        fields,
        baseUpdatedAt,
      });
      if (result.result === "conflict") {
        json(response, 409, {
          erro: "a nota foi atualizada em outro lugar",
          codigo: "CONFLITO_NOTA",
          note: result.note,
        });
        return;
      }
      json(response, 200, { note: result.note });
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId/notes/:noteId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      await deleteNote(pool, {
        classId: params.classId,
        noteId: params.noteId,
        userId: auth.user.id,
      });
      response.writeHead(204);
      response.end();
    },
  );
}

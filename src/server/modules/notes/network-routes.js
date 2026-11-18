import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { json } from "../../http/json.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { exigirMembro } from "../classes/exigir-membro.js";
import { parseNotesPagination } from "./routes.js";
import {
  addReference,
  deleteReference,
  getGraph,
  getReferenceCandidates,
  getReferences,
} from "./network-service.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseReferenceInput(body) {
  if (!isRecord(body) || !isUuid(body.targetNoteId)) {
    throw new HttpError(400, "DADOS_INVALIDOS", "nota de referência inválida");
  }
  return { targetNoteId: body.targetNoteId };
}

export function parseReferenceNoteId(search) {
  const noteId = new URLSearchParams(search).get("noteId");
  if (!isUuid(noteId)) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return noteId;
}

function ensureIds(params, ...ids) {
  if (![params.classId, ...ids].every(isUuid)) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
}

function getPagination(request) {
  return parseNotesPagination(new URL(request.url ?? "/", "http://localhost").search);
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

export function registerNoteNetworkRoutes(router, {
  pool,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para referências");

  router.add(
    "GET",
    "/api/classes/:classId/notes/:noteId/references",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      json(response, 200, await getReferences(
        pool,
        params.classId,
        params.noteId,
        getPagination(request),
      ));
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/notes/:noteId/references",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId);
      rateLimiter.consume(clientAddress(request), null);
      const { targetNoteId } = parseReferenceInput(await context.readJson());
      const result = await addReference(pool, {
        classId: params.classId,
        sourceNoteId: params.noteId,
        targetNoteId,
        userId: auth.user.id,
      });
      json(response, result.created ? 201 : 200, result);
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId/notes/:noteId/references/:targetNoteId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.noteId, params.targetNoteId);
      await deleteReference(pool, {
        classId: params.classId,
        sourceNoteId: params.noteId,
        targetNoteId: params.targetNoteId,
        userId: auth.user.id,
      });
      response.writeHead(204);
      response.end();
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/reference-candidates",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      const search = new URL(request.url ?? "/", "http://localhost").search;
      const noteId = parseReferenceNoteId(search);
      json(response, 200, await getReferenceCandidates(
        pool,
        params.classId,
        noteId,
        getPagination(request),
      ));
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/graph",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      const search = new URL(request.url ?? "/", "http://localhost").search;
      const noteId = parseReferenceNoteId(search);
      json(response, 200, await getGraph(
        pool,
        params.classId,
        noteId,
        getPagination(request),
      ));
    },
  );
}

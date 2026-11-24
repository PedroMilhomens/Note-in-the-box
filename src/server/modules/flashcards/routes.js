import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { json } from "../../http/json.js";
import { requireLogin } from "../../middleware/require-login.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { exigirMembro } from "../classes/exigir-membro.js";
import { parsePagination } from "../classes/routes.js";
import {
  createFlashcard,
  deleteFlashcard,
  getDueFlashcards,
  getFlashcardClassId,
  getFlashcards,
  getWeeklyPerformance,
  reviewFlashcard,
  updateFlashcard,
} from "./service.js";

const RATINGS = new Set(["errei", "dificil", "bom", "facil"]);
const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 20_000;
const QUESTION_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const ANSWER_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidFlashcardInput() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados do flashcard inválidos");
}

export function parseFlashcardInput(body) {
  if (
    !isRecord(body)
    || Object.keys(body).some((key) => !["question", "answer", "noteId"].includes(key))
    || typeof body.question !== "string"
    || typeof body.answer !== "string"
  ) {
    invalidFlashcardInput();
  }
  const question = body.question.trim();
  const answer = body.answer;
  const noteId = body.noteId ?? null;
  if (
    !question
    || question.length > MAX_QUESTION_LENGTH
    || QUESTION_CONTROL_CHARACTERS.test(question)
    || !answer.trim()
    || answer.length > MAX_ANSWER_LENGTH
    || ANSWER_CONTROL_CHARACTERS.test(answer)
    || (noteId !== null && !isUuid(noteId))
  ) {
    invalidFlashcardInput();
  }
  return { question, answer, noteId };
}

export function parseFlashcardReviewInput(body) {
  if (
    !isRecord(body)
    || Object.keys(body).length !== 1
    || !RATINGS.has(body.rating)
  ) {
    invalidFlashcardInput();
  }
  return { rating: body.rating };
}

function ensureIds(params, ...ids) {
  if (![params.classId, ...ids].every(isUuid)) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

function getPagination(request) {
  return parsePagination(new URL(request.url ?? "/", "http://localhost").search);
}

export function registerFlashcardRoutes(router, {
  pool,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para flashcards");

  router.add(
    "GET",
    "/api/classes/:classId/flashcards",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      json(response, 200, await getFlashcards(
        pool,
        params.classId,
        auth.user.id,
        getPagination(request),
      ));
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/flashcards",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const result = await createFlashcard(pool, {
        classId: params.classId,
        ownerId: auth.user.id,
        ...parseFlashcardInput(await context.readJson()),
      });
      json(response, 201, result);
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/flashcards/due",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      json(response, 200, await getDueFlashcards(
        pool,
        params.classId,
        auth.user.id,
        getPagination(request),
      ));
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/flashcards/performance",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      json(response, 200, await getWeeklyPerformance(
        pool,
        params.classId,
        auth.user.id,
      ));
    },
  );

  router.add(
    "POST",
    "/api/flashcards/:cardId/review",
    async (request, response, params, context) => {
      const auth = await requireLogin(request, pool);
      if (!isUuid(params.cardId)) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      const classId = await getFlashcardClassId(pool, params.cardId);
      if (!classId) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      await exigirMembro(request, pool, classId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const { rating } = parseFlashcardReviewInput(await context.readJson());
      json(response, 201, await reviewFlashcard(pool, {
        cardId: params.cardId,
        classId,
        userId: auth.user.id,
        rating,
      }));
    },
  );

  router.add(
    "PATCH",
    "/api/flashcards/:cardId",
    async (request, response, params, context) => {
      const auth = await requireLogin(request, pool);
      if (!isUuid(params.cardId)) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      const classId = await getFlashcardClassId(pool, params.cardId);
      if (!classId) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      await exigirMembro(request, pool, classId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const { question, answer } = parseFlashcardInput(await context.readJson());
      json(response, 200, await updateFlashcard(pool, {
        cardId: params.cardId,
        classId,
        userId: auth.user.id,
        question,
        answer,
      }));
    },
  );

  router.add(
    "DELETE",
    "/api/flashcards/:cardId",
    async (request, response, params) => {
      const auth = await requireLogin(request, pool);
      if (!isUuid(params.cardId)) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      const classId = await getFlashcardClassId(pool, params.cardId);
      if (!classId) {
        throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
      }
      await exigirMembro(request, pool, classId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      json(response, 200, await deleteFlashcard(pool, {
        cardId: params.cardId,
        classId,
        userId: auth.user.id,
      }));
    },
  );
}

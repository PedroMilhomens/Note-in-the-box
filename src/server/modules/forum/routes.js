import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { json } from "../../http/json.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { parsePagination } from "../classes/routes.js";
import { exigirMembro } from "../classes/exigir-membro.js";
import {
  createPost,
  createTopic,
  getForumNoteCandidates,
  getTopicPosts,
  getTopics,
  removePost,
  removeTopic,
} from "./service.js";

const MAX_TOPIC_TITLE_LENGTH = 200;
const MAX_FORUM_BODY_LENGTH = 20_000;
const TITLE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const BODY_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidForumInput() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados do fórum inválidos");
}

export function parseForumTopicInput(body) {
  if (
    !isRecord(body)
    || Object.keys(body).some((key) => !["title", "body", "noteId"].includes(key))
    || typeof body.title !== "string"
    || typeof body.body !== "string"
  ) {
    invalidForumInput();
  }
  const title = body.title.trim();
  const noteId = body.noteId ?? null;
  if (
    !title
    || title.length > MAX_TOPIC_TITLE_LENGTH
    || TITLE_CONTROL_CHARACTERS.test(title)
    || !body.body.trim()
    || body.body.length > MAX_FORUM_BODY_LENGTH
    || BODY_CONTROL_CHARACTERS.test(body.body)
    || (noteId !== null && !isUuid(noteId))
  ) {
    invalidForumInput();
  }
  return { title, body: body.body, noteId };
}

export function parseForumPostInput(body) {
  if (
    !isRecord(body)
    || Object.keys(body).length !== 1
    || typeof body.body !== "string"
    || !body.body.trim()
    || body.body.length > MAX_FORUM_BODY_LENGTH
    || BODY_CONTROL_CHARACTERS.test(body.body)
  ) {
    invalidForumInput();
  }
  return { body: body.body };
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

export function registerForumRoutes(router, {
  pool,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para o fórum");

  router.add(
    "GET",
    "/api/classes/:classId/forum/topics",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      json(response, 200, await getTopics(
        pool,
        params.classId,
        getPagination(request),
      ));
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/forum/topics",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const result = await createTopic(pool, {
        classId: params.classId,
        authorId: auth.user.id,
        ...parseForumTopicInput(await context.readJson()),
      });
      json(response, 201, result);
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/forum/notes",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params);
      json(response, 200, await getForumNoteCandidates(
        pool,
        params.classId,
        getPagination(request),
      ));
    },
  );

  router.add(
    "GET",
    "/api/classes/:classId/forum/topics/:topicId/posts",
    async (request, response, params) => {
      await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.topicId);
      json(response, 200, await getTopicPosts(
        pool,
        params.classId,
        params.topicId,
        getPagination(request),
      ));
    },
  );

  router.add(
    "POST",
    "/api/classes/:classId/forum/topics/:topicId/posts",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.topicId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const result = await createPost(pool, {
        classId: params.classId,
        topicId: params.topicId,
        authorId: auth.user.id,
        ...parseForumPostInput(await context.readJson()),
      });
      json(response, 201, result);
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId/forum/topics/:topicId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.topicId);
      await removeTopic(pool, {
        classId: params.classId,
        topicId: params.topicId,
        userId: auth.user.id,
      });
      response.writeHead(204);
      response.end();
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId/forum/topics/:topicId/posts/:postId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      ensureIds(params, params.topicId, params.postId);
      await removePost(pool, {
        classId: params.classId,
        topicId: params.topicId,
        postId: params.postId,
        userId: auth.user.id,
      });
      response.writeHead(204);
      response.end();
    },
  );
}

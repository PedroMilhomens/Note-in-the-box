import { HttpError } from "../../http/errors.js";
import { json } from "../../http/json.js";
import { requireLogin } from "../../middleware/require-login.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { exigirMembro } from "./exigir-membro.js";
import {
  createClass,
  deleteClass,
  getClass,
  getClassInviteCode,
  getMyClasses,
  joinClass,
  regenerateClassInviteCode,
  updateClass,
  updateClassRules,
} from "./service.js";

const MAX_NAME_LENGTH = 100;
const MAX_PROFESSOR_NAME_LENGTH = 120;
const MAX_CLASS_RULES_LENGTH = 5000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidClassInput() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados da classe inválidos");
}

export function parseClassInput(body) {
  if (!isRecord(body)) invalidClassInput();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const professorName = body.professorName === undefined
    || body.professorName === null
    || body.professorName === ""
    ? null
    : typeof body.professorName === "string"
      ? body.professorName.trim()
      : undefined;

  if (
    !name
    || name.length > MAX_NAME_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(name)
    || professorName === undefined
    || professorName?.length > MAX_PROFESSOR_NAME_LENGTH
    || (professorName && /[\u0000-\u001f\u007f]/u.test(professorName))
  ) {
    invalidClassInput();
  }
  return { name, professorName: professorName || null };
}

export function parseClassRulesInput(body) {
  if (
    !isRecord(body)
    || Object.keys(body).length !== 1
    || typeof body.rules !== "string"
  ) {
    invalidClassInput();
  }
  const rules = body.rules.trim();
  if (
    rules.length > MAX_CLASS_RULES_LENGTH
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(rules)
  ) {
    invalidClassInput();
  }
  return { rules };
}

export function parseInviteCode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new HttpError(400, "CONVITE_INVALIDO", "código de convite inválido");
  }
  return value;
}

function paginationValue(value, fallback, maximum) {
  if (value === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function parsePagination(search) {
  const params = new URLSearchParams(search);
  const limit = paginationValue(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = paginationValue(params.get("offset"), 0, MAX_OFFSET);
  if (limit === null || limit < 1 || offset === null) {
    throw new HttpError(400, "PAGINACAO_INVALIDA", "paginação inválida");
  }
  return { limit, offset };
}

function getPagination(request) {
  return parsePagination(new URL(request.url ?? "/", "http://localhost").search);
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

export function registerClassRoutes(router, {
  pool,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para classes");

  router.add("POST", "/api/classes", async (request, response, _params, context) => {
    const auth = await requireLogin(request, pool);
    const input = parseClassInput(await context.readJson());
    const result = await createClass(pool, {
      userId: auth.user.id,
      ...input,
    });
    json(response, 201, result);
  });

  router.add("POST", "/api/classes/join", async (request, response, _params, context) => {
    const auth = await requireLogin(request, pool);
    rateLimiter.consume(clientAddress(request), null);
    const body = await context.readJson();
    const inviteCode = parseInviteCode(isRecord(body) ? body.inviteCode : null);
    const result = await joinClass(pool, {
      userId: auth.user.id,
      inviteCode,
    });
    json(response, 200, result);
  });

  router.add("GET", "/api/classes", async (request, response) => {
    const auth = await requireLogin(request, pool);
    const result = await getMyClasses(pool, auth.user.id, getPagination(request));
    json(response, 200, result);
  });

  router.add("GET", "/api/classes/:classId", async (request, response, params) => {
    await exigirMembro(request, pool, params.classId);
    const result = await getClass(pool, params.classId, getPagination(request));
    json(response, 200, result);
  });

  router.add("GET", "/api/classes/:classId/invite-code", async (request, response, params) => {
    const auth = await exigirMembro(request, pool, params.classId);
    const result = await getClassInviteCode(pool, params.classId, auth.user.id);
    json(response, 200, result);
  });

  router.add("POST", "/api/classes/:classId/regenerate-invite-code", async (request, response, params) => {
    const auth = await exigirMembro(request, pool, params.classId);
    rateLimiter.consume(clientAddress(request), auth.user.id);
    const result = await regenerateClassInviteCode(pool, params.classId, auth.user.id);
    json(response, 200, result);
  });

  router.add(
    "PATCH",
    "/api/classes/:classId/rules",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const { rules } = parseClassRulesInput(await context.readJson());
      const result = await updateClassRules(pool, {
        classId: params.classId,
        userId: auth.user.id,
        rules,
      });
      json(response, 200, result);
    },
  );

  router.add(
    "PATCH",
    "/api/classes/:classId",
    async (request, response, params, context) => {
      const auth = await exigirMembro(request, pool, params.classId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const { name, professorName } = parseClassInput(await context.readJson());
      const result = await updateClass(pool, {
        classId: params.classId,
        userId: auth.user.id,
        name,
        professorName,
      });
      json(response, 200, result);
    },
  );

  router.add(
    "DELETE",
    "/api/classes/:classId",
    async (request, response, params) => {
      const auth = await exigirMembro(request, pool, params.classId);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      json(response, 200, await deleteClass(pool, {
        classId: params.classId,
        userId: auth.user.id,
      }));
    },
  );
}

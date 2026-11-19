import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { json } from "../../http/json.js";
import { requireLogin } from "../../middleware/require-login.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { exigirMembro } from "../classes/exigir-membro.js";
import { recordPomodoroSession } from "./service.js";

const SESSION_KINDS = new Set(["foco", "pausa", "longa"]);
const MIN_DURATION_SECONDS = 60;
const MAX_DURATION_SECONDS = 120 * 60;
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidPomodoroInput() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados do Pomodoro inválidos");
}

export function parsePomodoroInput(body, now = new Date()) {
  const allowedFields = new Set([
    "kind",
    "startedAt",
    "durationS",
    "completed",
    "classId",
  ]);
  if (
    !isRecord(body)
    || Object.keys(body).length !== allowedFields.size
    || Object.keys(body).some((key) => !allowedFields.has(key))
    || !SESSION_KINDS.has(body.kind)
    || typeof body.startedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(body.startedAt)
    || !Number.isSafeInteger(body.durationS)
    || body.durationS < MIN_DURATION_SECONDS
    || body.durationS > MAX_DURATION_SECONDS
    || body.completed !== true
    || (body.classId !== null && !isUuid(body.classId))
  ) {
    invalidPomodoroInput();
  }

  const startedAt = new Date(body.startedAt);
  if (
    Number.isNaN(startedAt.valueOf())
    || startedAt.toISOString() !== body.startedAt
    || !(now instanceof Date)
    || Number.isNaN(now.valueOf())
    || now.getTime() - startedAt.getTime()
      < body.durationS * 1000 - CLOCK_SKEW_TOLERANCE_MS
  ) {
    invalidPomodoroInput();
  }

  return {
    kind: body.kind,
    startedAt,
    durationS: body.durationS,
    completed: true,
    classId: body.classId,
  };
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

export function registerPomodoroRoutes(router, {
  pool,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para Pomodoro");

  router.add(
    "POST",
    "/api/pomodoro/sessions",
    async (request, response, _params, context) => {
      const auth = await requireLogin(request, pool);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const input = parsePomodoroInput(await context.readJson());
      if (input.classId) {
        await exigirMembro(request, pool, input.classId);
      }
      json(response, 201, await recordPomodoroSession(pool, {
        userId: auth.user.id,
        ...input,
      }));
    },
  );
}

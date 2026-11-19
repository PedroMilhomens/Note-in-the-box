import { HttpError } from "../../http/errors.js";
import { json } from "../../http/json.js";
import { requireLogin } from "../../middleware/require-login.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import { normalizeEmail } from "../auth/routes.js";
import { clearSessionCookie } from "../auth/session.js";
import {
  deleteUserAccount,
  exportAccountData,
  getConsents,
  correctProfile,
  revokeUserConsent,
} from "./service.js";

const PROFILE_FIELD_LIMIT = 120;
const PROFILE_NAME_LIMIT = 100;
const CONSENT_KINDS = new Set(["termos", "privacidade"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidProfileInput() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados de perfil inválidos");
}

function optionalProfileField(value) {
  if (value === null || value === "") return null;
  if (
    typeof value !== "string"
    || value.trim().length > PROFILE_FIELD_LIMIT
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return undefined;
  }
  return value.trim() || null;
}

export function parseProfileUpdate(body) {
  if (!isRecord(body)) invalidProfileInput();
  const allowedFields = new Set(["name", "email", "institution", "course"]);
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    invalidProfileInput();
  }

  const fields = {};
  if (Object.hasOwn(body, "name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (
      !name
      || name.length > PROFILE_NAME_LIMIT
      || /[\u0000-\u001f\u007f]/u.test(name)
    ) {
      invalidProfileInput();
    }
    fields.name = name;
  }
  if (Object.hasOwn(body, "email")) {
    const email = normalizeEmail(body.email);
    if (!email) invalidProfileInput();
    fields.email = email;
  }
  for (const field of ["institution", "course"]) {
    if (!Object.hasOwn(body, field)) continue;
    const value = optionalProfileField(body[field]);
    if (value === undefined) invalidProfileInput();
    fields[field] = value;
  }
  return fields;
}

function parseConsentInput(body) {
  if (
    !isRecord(body)
    || Object.keys(body).length !== 1
    || !CONSENT_KINDS.has(body.kind)
  ) {
    throw new HttpError(400, "DADOS_INVALIDOS", "consentimento inválido");
  }
  return body.kind;
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

export function registerPrivacyRoutes(router, {
  pool,
  nodeEnv = "development",
  uploadRoot,
  staticRoot,
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para privacidade");

  router.add("GET", "/api/me/consents", async (request, response) => {
    const auth = await requireLogin(request, pool);
    json(response, 200, { consents: await getConsents(pool, auth.user.id) });
  });

  router.add("GET", "/api/me/export", async (request, response) => {
    const auth = await requireLogin(request, pool);
    rateLimiter.consume(clientAddress(request), auth.user.id);
    const data = await exportAccountData(pool, auth.user.id, {
      uploadRoot,
      staticRoot,
    });
    json(response, 200, data, {
      "content-disposition": 'attachment; filename="meus-dados.json"',
    });
  });

  router.add("PATCH", "/api/me", async (request, response, _params, context) => {
    const auth = await requireLogin(request, pool);
    rateLimiter.consume(clientAddress(request), auth.user.id);
    const fields = parseProfileUpdate(await context.readJson());
    const user = await correctProfile(pool, auth.user.id, fields);
    json(response, 200, { user });
  });

  router.add(
    "PATCH",
    "/api/me/consents",
    async (request, response, _params, context) => {
      const auth = await requireLogin(request, pool);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const kind = parseConsentInput(await context.readJson());
      const consent = await revokeUserConsent(pool, auth.user.id, kind);
      json(response, 200, { consent });
    },
  );

  router.add(
    "DELETE",
    "/api/me",
    async (request, response, _params, context) => {
      const auth = await requireLogin(request, pool);
      rateLimiter.consume(clientAddress(request), auth.user.id);
      const body = await context.readJson();
      if (
        !isRecord(body)
        || Object.keys(body).length !== 1
        || body.confirmation !== "EXCLUIR"
      ) {
        throw new HttpError(
          400,
          "CONFIRMACAO_OBRIGATORIA",
          "confirme a exclusão da conta",
        );
      }
      await deleteUserAccount(pool, auth.user.id);
      json(response, 200, { status: "deleted" }, {
        "set-cookie": clearSessionCookie(nodeEnv),
      });
    },
  );
}

import { createHash } from "node:crypto";
import { HttpError } from "../../http/errors.js";
import { json } from "../../http/json.js";
import { requireLogin } from "../../middleware/require-login.js";
import { RateLimiter } from "../../middleware/rate-limit.js";
import {
  getDummyPasswordHash,
  hashPassword,
  isStrongPassword,
  verifyPassword,
} from "./password.js";
import {
  clearSessionCookie,
  createSession,
  sessionCookie,
} from "./session.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MAX_PROFILE_FIELD_LENGTH = 120;

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length > 254
    || !EMAIL_PATTERN.test(email)
    || /[\u0000-\u001f\u007f]/u.test(email)
  ) {
    return null;
  }
  return email;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function profileField(value) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string"
    || value.trim().length > MAX_PROFILE_FIELD_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return undefined;
  }
  return value.trim() || null;
}

function accountRateKey(email) {
  if (!email) return null;
  return createHash("sha256").update(email).digest("hex");
}

function clientAddress(request) {
  return request.socket.remoteAddress ?? "unknown";
}

function invalidRegistration() {
  throw new HttpError(400, "DADOS_INVALIDOS", "dados de cadastro inválidos");
}

async function createUser(pool, {
  name,
  email,
  passwordHash,
  institution,
  course,
  termsVersion,
  privacyVersion,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, institution, course)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, institution, course`,
      [name, email, passwordHash, institution, course],
    );
    const user = userResult.rows[0];
    await client.query(
      `INSERT INTO consents (user_id, kind, version)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [user.id, "termos", termsVersion, "privacidade", privacyVersion],
    );
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new HttpError(409, "CONTA_JA_EXISTE", "não foi possível criar a conta");
    }
    throw error;
  } finally {
    client.release();
  }
}

function parseRegistration(body) {
  if (!isRecord(body)) invalidRegistration();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const institution = profileField(body.institution);
  const course = profileField(body.course);

  if (
    !name
    || name.length > 100
    || /[\u0000-\u001f\u007f]/u.test(name)
    || !email
    || institution === undefined
    || course === undefined
  ) {
    invalidRegistration();
  }
  if (body.acceptTerms !== true || body.acceptPrivacy !== true) {
    throw new HttpError(
      400,
      "CONSENTIMENTO_OBRIGATORIO",
      "aceite os Termos e a Política de Privacidade",
    );
  }
  if (!isStrongPassword(body.password)) {
    throw new HttpError(
      400,
      "SENHA_FRACA",
      "a senha não atende à política mínima",
    );
  }

  return { name, email, institution, course, password: body.password };
}

async function register(request, response, context, {
  pool,
  rateLimiter,
  termsVersion,
  privacyVersion,
}) {
  const body = await context.readJson();
  const email = isRecord(body) ? normalizeEmail(body.email) : null;
  rateLimiter.consume(clientAddress(request), accountRateKey(email));

  const values = parseRegistration(body);
  const passwordHash = await hashPassword(values.password);
  const user = await createUser(pool, {
    ...values,
    passwordHash,
    termsVersion,
    privacyVersion,
  });
  json(response, 201, { user });
}

async function login(request, response, context, {
  pool,
  rateLimiter,
  nodeEnv,
}) {
  const body = await context.readJson();
  const email = isRecord(body) ? normalizeEmail(body.email) : null;
  const password = isRecord(body) && typeof body.password === "string"
    && Buffer.byteLength(body.password, "utf8") <= 256
    ? body.password
    : "";
  rateLimiter.consume(clientAddress(request), accountRateKey(email));

  const userResult = await pool.query(
    `SELECT id, name, email, institution, course, password_hash
     FROM users
     WHERE lower(email) = $1 AND deleted_at IS NULL`,
    [email ?? ""],
  );
  const user = userResult.rows[0] ?? null;
  const passwordHash = user?.password_hash ?? await getDummyPasswordHash();
  const passwordMatches = await verifyPassword(password, passwordHash);
  if (!user || !email || !password || !passwordMatches) {
    throw new HttpError(
      401,
      "CREDENCIAIS_INVALIDAS",
      "e-mail ou senha incorretos",
    );
  }

  const session = await createSession(pool, user.id);
  json(response, 200, {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      institution: user.institution,
      course: user.course,
    },
  }, {
    "set-cookie": sessionCookie(session.token, nodeEnv),
  });
}

export function registerAuthRoutes(router, {
  pool,
  nodeEnv = "development",
  termsVersion = "terms-v1",
  privacyVersion = "privacy-v1",
  rateLimiter = new RateLimiter(),
}) {
  if (!pool) throw new TypeError("Pool do banco é obrigatório para autenticação");

  router.add("POST", "/api/auth/register", (request, response, _params, context) => (
    register(request, response, context, {
      pool,
      rateLimiter,
      termsVersion,
      privacyVersion,
    })
  ));

  router.add("POST", "/api/auth/login", (request, response, _params, context) => (
    login(request, response, context, {
      pool,
      rateLimiter,
      nodeEnv,
    })
  ));

  router.add("POST", "/api/auth/logout", async (request, response) => {
    const auth = await requireLogin(request, pool);
    await pool.query("DELETE FROM sessions WHERE id = $1", [auth.sessionId]);
    json(response, 200, { status: "ok" }, {
      "set-cookie": clearSessionCookie(nodeEnv),
    });
  });

  router.add("GET", "/api/me", async (request, response) => {
    const auth = await requireLogin(request, pool);
    json(response, 200, { user: auth.user });
  });
}

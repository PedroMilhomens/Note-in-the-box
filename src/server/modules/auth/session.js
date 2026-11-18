import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "note_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function readSessionToken(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const values = cookieHeader.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (values.length !== 1) return null;
  const token = values[0].slice(SESSION_COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sessionCookie(token, nodeEnv) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (nodeEnv === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie(nodeEnv) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (nodeEnv === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export async function createSession(pool, userId) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const result = await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, tokenHash, expiresAt],
  );
  return { token, sessionId: result.rows[0].id };
}

export async function findSession(pool, token) {
  const result = await pool.query(
    `SELECT s.id AS session_id, u.id, u.name, u.email, u.institution, u.course
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND u.deleted_at IS NULL`,
    [hashSessionToken(token)],
  );
  return result.rows[0] ?? null;
}

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createServer } from "../../src/server/index.js";
import { RateLimiter } from "../../src/server/middleware/rate-limit.js";
import { testPool } from "../helpers/test-db.js";

function getCookie(response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";", 1)[0];
}

test("cadastro, consentimento, login, sessão, /me e logout", async (context) => {
  const email = `aluno-${randomUUID()}@example.test`;
  const password = "frase-forte-ficticia-2031";
  const logs = [];
  let userId;
  const server = createServer({
    pool: testPool,
    nodeEnv: "test",
    appOrigin: null,
    legalDocumentsApproved: true,
    rateLimiter: new RateLimiter({ limit: 20 }),
    logger: (entry) => logs.push(entry),
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  context.after(async () => {
    if (userId) {
      await testPool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await testPool.end();
  });

  const withoutConsent = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      name: "Aluno Fictício",
      email,
      password,
      acceptTerms: true,
    }),
  });
  assert.equal(withoutConsent.status, 400);
  assert.equal((await withoutConsent.json()).codigo, "CONSENTIMENTO_OBRIGATORIO");

  const registration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      name: "Aluno Fictício",
      email,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
    }),
  });

  assert.equal(registration.status, 201);
  const registered = await registration.json();
  userId = registered.user.id;

  const consentResult = await testPool.query(
    "SELECT kind, version FROM consents WHERE user_id = $1 ORDER BY kind",
    [userId],
  );
  assert.deepEqual(consentResult.rows, [
    { kind: "privacidade", version: "privacy-v1" },
    { kind: "termos", version: "terms-v1" },
  ]);

  const wrongLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ email, password: "senha-errada-ficticia" }),
  });
  const missingLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      email: `inexistente-${randomUUID()}@example.test`,
      password: "senha-errada-ficticia",
    }),
  });
  const wrongLoginBody = await wrongLogin.json();
  const missingLoginBody = await missingLogin.json();

  assert.equal(wrongLogin.status, 401);
  assert.deepEqual(wrongLoginBody, missingLoginBody);
  assert.deepEqual(wrongLoginBody, {
    erro: "e-mail ou senha incorretos",
    codigo: "CREDENCIAIS_INVALIDAS",
  });

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const sessionCookie = getCookie(login);
  assert.match(sessionCookie, /^note_session=[A-Za-z0-9_-]{43}$/);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(login.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.match(login.headers.get("set-cookie"), /Path=\//i);
  assert.doesNotMatch(login.headers.get("set-cookie"), /Secure/i);

  const rawToken = sessionCookie.slice("note_session=".length);
  assert.equal(Buffer.from(rawToken, "base64url").length, 32);
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const storedSession = await testPool.query(
    "SELECT token_hash, expires_at FROM sessions WHERE user_id = $1",
    [userId],
  );
  assert.equal(storedSession.rows[0].token_hash, tokenHash);
  assert.ok(new Date(storedSession.rows[0].expires_at) > new Date());
  assert.notEqual(storedSession.rows[0].token_hash, rawToken);
  const storedPassword = await testPool.query(
    "SELECT password_hash FROM users WHERE id = $1",
    [userId],
  );
  assert.notEqual(storedPassword.rows[0].password_hash, password);
  assert.match(storedPassword.rows[0].password_hash, /^scrypt\$/);

  const me = await fetch(`${origin}/api/me`, {
    headers: { cookie: sessionCookie },
  });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), {
    user: {
      id: userId,
      name: "Aluno Fictício",
      email,
      institution: null,
      course: null,
    },
  });

  const secondLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ email, password }),
  });
  const secondCookie = getCookie(secondLogin);
  assert.notEqual(secondCookie, sessionCookie);

  const thirdLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ email, password }),
  });
  const thirdCookie = getCookie(thirdLogin);
  const thirdToken = thirdCookie.slice("note_session=".length);
  await testPool.query(
    "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
    [createHash("sha256").update(thirdToken).digest("hex")],
  );
  const expiredSession = await fetch(`${origin}/api/me`, {
    headers: { cookie: thirdCookie },
  });
  assert.equal(expiredSession.status, 401);

  const logout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin,
    },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);

  const loggedOut = await fetch(`${origin}/api/me`, {
    headers: { cookie: sessionCookie },
  });
  assert.equal(loggedOut.status, 401);

  const stillLoggedIn = await fetch(`${origin}/api/me`, {
    headers: { cookie: secondCookie },
  });
  assert.equal(stillLoggedIn.status, 200);

  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(email), false);
  assert.equal(serializedLogs.includes(password), false);
  assert.equal(serializedLogs.includes(rawToken), false);
});

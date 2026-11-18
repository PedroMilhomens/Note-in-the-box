import { randomUUID } from "node:crypto";
import {
  createSession,
  sessionCookie,
} from "../../src/server/modules/auth/session.js";

export async function createClassTestUser(pool, name) {
  const email = `classe-${randomUUID()}@example.test`;
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [name, email, "hash-ficticio-de-teste"],
  );
  const user = { id: result.rows[0].id, email, name };
  const session = await createSession(pool, user.id);
  return {
    ...user,
    cookie: sessionCookie(session.token, "test"),
  };
}

export async function cleanupClassFixtures(pool, { userIds, classIds }) {
  if (classIds.length > 0) {
    await pool.query(
      "DELETE FROM classes WHERE id = ANY($1::uuid[])",
      [classIds],
    );
  }
  if (userIds.length > 0) {
    await pool.query(
      "DELETE FROM users WHERE id = ANY($1::uuid[])",
      [userIds],
    );
  }
}

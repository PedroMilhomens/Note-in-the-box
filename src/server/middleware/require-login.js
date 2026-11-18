import { HttpError } from "../http/errors.js";
import {
  findSession,
  readSessionToken,
} from "../modules/auth/session.js";

export async function requireLogin(request, pool) {
  const token = readSessionToken(request.headers.cookie);
  if (!token) {
    throw new HttpError(401, "NAO_AUTENTICADO", "autenticação necessária");
  }

  const session = await findSession(pool, token);
  if (!session) {
    throw new HttpError(401, "NAO_AUTENTICADO", "autenticação necessária");
  }

  request.auth = {
    sessionId: session.session_id,
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      institution: session.institution,
      course: session.course,
    },
  };
  return request.auth;
}

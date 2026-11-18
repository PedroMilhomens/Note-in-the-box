import { HttpError } from "../../http/errors.js";
import { requireLogin } from "../../middleware/require-login.js";
import { isClassMember } from "./repository.js";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

export async function exigirMembro(request, pool, classId) {
  const auth = await requireLogin(request, pool);
  if (
    typeof classId !== "string"
    || !UUID_PATTERN.test(classId)
    || !await isClassMember(pool, classId, auth.user.id)
  ) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return auth;
}

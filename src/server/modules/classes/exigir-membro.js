import { HttpError } from "../../http/errors.js";
import { isUuid } from "../../http/uuid.js";
import { requireLogin } from "../../middleware/require-login.js";
import { isClassMember } from "./repository.js";

export async function exigirMembro(request, pool, classId) {
  const auth = await requireLogin(request, pool);
  if (
    !isUuid(classId)
    || !await isClassMember(pool, classId, auth.user.id)
  ) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return auth;
}

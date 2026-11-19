import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "../../http/errors.js";
import {
  createClass as createClassRecord,
  getClassDetails,
  joinClass as joinClassRecord,
  listUserClasses,
  updateClassRules as updateClassRulesRecord,
} from "./repository.js";

export async function createClass(pool, { userId, name, professorName }) {
  const inviteCode = randomBytes(32).toString("base64url");
  const result = await createClassRecord(pool, {
    userId,
    name,
    professorName,
    inviteCodeHash: hashInviteCode(inviteCode),
  });
  return { ...result, inviteCode };
}

export async function joinClass(pool, { userId, inviteCode }) {
  const result = await joinClassRecord(pool, {
    userId,
    inviteCodeHash: hashInviteCode(inviteCode),
  });
  if (!result) {
    throw new HttpError(404, "CONVITE_NAO_ENCONTRADO", "convite não encontrado");
  }
  return result;
}

export async function getMyClasses(pool, userId, pagination) {
  const classes = await listUserClasses(pool, userId, pagination);
  return { classes, pagination };
}

export async function getClass(pool, classId, pagination) {
  const result = await getClassDetails(pool, classId, pagination);
  if (!result) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return { ...result, pagination };
}

export async function updateClassRules(pool, { classId, userId, rules }) {
  const result = await updateClassRulesRecord(pool, { classId, userId, rules });
  if (!result) {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
  return { class: result };
}

function hashInviteCode(inviteCode) {
  return createHash("sha256").update(inviteCode).digest("hex");
}

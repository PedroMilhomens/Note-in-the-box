import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../../http/errors.js";
import {
  anonymizeAccount,
  exportUserData,
  listConsents,
  purgeAnonymizedAccounts,
  revokeConsent,
  updateProfile,
} from "./repository.js";
import {
  isStorageKey,
  resolvePrivateUploadRoot,
} from "../notes/collaboration-service.js";

export async function getConsents(pool, userId) {
  return listConsents(pool, userId);
}

export async function exportAccountData(pool, userId, {
  uploadRoot,
  staticRoot,
}) {
  const data = await exportUserData(pool, userId);
  if (!data) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  const attachments = data.attachments;
  if (attachments.length > 0) {
    const privateRoot = await resolvePrivateUploadRoot(uploadRoot, staticRoot);
    for (const attachment of attachments) {
      if (!isStorageKey(attachment.storageKey)) {
        throw new Error("Chave de anexo inválida no armazenamento privado");
      }
      const bytes = await fs.readFile(path.join(privateRoot, attachment.storageKey));
      attachment.contentBase64 = bytes.toString("base64");
      delete attachment.storageKey;
    }
  }
  return data;
}

export async function correctProfile(pool, userId, fields) {
  try {
    const user = await updateProfile(pool, userId, fields);
    if (!user) {
      throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
    }
    return user;
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "CONTA_JA_EXISTE", "e-mail já está em uso");
    }
    throw error;
  }
}

export async function revokeUserConsent(pool, userId, kind) {
  const consent = await revokeConsent(pool, userId, kind);
  if (!consent) {
    throw new HttpError(404, "CONSENTIMENTO_NAO_ENCONTRADO", "consentimento não encontrado");
  }
  return consent;
}

export async function deleteUserAccount(pool, userId) {
  const deleted = await anonymizeAccount(pool, userId);
  if (!deleted) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
}

export async function purgeExpiredAccounts(pool, {
  cutoff,
  uploadRoot,
  staticRoot,
}) {
  const before = cutoff instanceof Date ? cutoff : new Date(cutoff);
  if (
    Number.isNaN(before.getTime())
    || before.getTime() > Date.now()
  ) {
    throw new TypeError("RETENTION_CUTOFF deve ser uma data passada válida");
  }
  const privateRoot = await resolvePrivateUploadRoot(
    uploadRoot,
    staticRoot,
    { create: true },
  );
  const { accountsDeleted, storageKeys } = await purgeAnonymizedAccounts(
    pool,
    before,
  );
  let attachmentsDeleted = 0;
  for (const storageKey of storageKeys) {
    if (!isStorageKey(storageKey)) {
      throw new Error("Chave de anexo inválida no armazenamento privado");
    }
    try {
      await fs.unlink(path.join(privateRoot, storageKey));
      attachmentsDeleted += 1;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { accountsDeleted, attachmentsDeleted };
}

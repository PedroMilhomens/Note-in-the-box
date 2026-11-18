import { HttpError } from "../../http/errors.js";
import {
  createNote as createNoteRecord,
  deleteNote as deleteNoteRecord,
  listBranchNotes,
  listMissedLessons as listMissedLessonsRecord,
  readNote as readNoteRecord,
  updateNote as updateNoteRecord,
} from "./repository.js";

export async function createNote(pool, values) {
  const result = await createNoteRecord(pool, values);
  if (result.result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result.result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
  return result.note;
}

export async function getBranchNotes(pool, classId, branchId, pagination) {
  const notes = await listBranchNotes(pool, classId, branchId, pagination);
  if (notes.length === 0 && !await branchExists(pool, classId, branchId)) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return { notes, pagination };
}

export async function getNote(pool, classId, noteId) {
  const note = await readNoteRecord(pool, classId, noteId);
  if (!note) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return note;
}

export async function updateNote(pool, values) {
  const result = await updateNoteRecord(pool, values);
  if (result.result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result.result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
  return result.note;
}

export async function deleteNote(pool, values) {
  const result = await deleteNoteRecord(pool, values);
  if (result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
}

export async function getMissedLessons(pool, classId, userId, pagination) {
  const lessons = await listMissedLessonsRecord(pool, classId, userId, pagination);
  return { lessons, pagination };
}

async function branchExists(pool, classId, branchId) {
  const result = await pool.query(
    "SELECT 1 FROM branches WHERE id = $1 AND class_id = $2",
    [branchId, classId],
  );
  return result.rowCount > 0;
}

import { HttpError } from "../../http/errors.js";
import {
  addNoteReference as addNoteReferenceRecord,
  deleteNoteReference as deleteNoteReferenceRecord,
  getNoteNeighborhood,
  listNoteReferences,
  listReferenceCandidates,
} from "./network-repository.js";

export async function getReferences(pool, classId, noteId, pagination) {
  const references = await listNoteReferences(pool, classId, noteId, pagination);
  if (!references) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return { references, pagination };
}

export async function addReference(pool, values) {
  const result = await addNoteReferenceRecord(pool, values);
  if (result.result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result.result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
  if (result.result === "same_branch") {
    throw new HttpError(
      400,
      "BRANCH_INVALIDA",
      "a referência precisa apontar para outra branch da classe",
    );
  }
  return { reference: result.reference, created: result.created };
}

export async function deleteReference(pool, values) {
  const result = await deleteNoteReferenceRecord(pool, values);
  if (result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result === "forbidden") {
    throw new HttpError(403, "PERMISSAO_NEGADA", "permissão negada");
  }
}

export async function getReferenceCandidates(
  pool,
  classId,
  sourceNoteId,
  pagination,
) {
  const candidates = await listReferenceCandidates(
    pool,
    classId,
    sourceNoteId,
    pagination,
  );
  if (!candidates) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return { candidates, pagination };
}

export async function getGraph(pool, classId, rootNoteId, pagination) {
  const graph = await getNoteNeighborhood(
    pool,
    classId,
    rootNoteId,
    pagination,
  );
  if (!graph) {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  return { rootNoteId, ...graph, pagination };
}

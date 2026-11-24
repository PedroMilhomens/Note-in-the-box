import { HttpError } from "../../http/errors.js";
import {
  createFlashcard as createFlashcardRecord,
  createReview,
  deleteFlashcard as deleteFlashcardRecord,
  getFlashcardClassId as getFlashcardClassIdRecord,
  getWeeklyPerformance as getWeeklyPerformanceRecord,
  listDueFlashcards,
  listFlashcards,
  updateFlashcard as updateFlashcardRecord,
} from "./repository.js";

export async function getFlashcards(pool, classId, userId, pagination) {
  const cards = await listFlashcards(pool, classId, userId, pagination);
  return { cards, pagination };
}

export async function getDueFlashcards(pool, classId, userId, pagination) {
  const cards = await listDueFlashcards(pool, classId, userId, pagination);
  return { cards, pagination };
}

export async function createFlashcard(pool, values) {
  const card = await createFlashcardRecord(pool, values);
  if (!card) throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  return { card };
}

export async function getFlashcardClassId(pool, cardId) {
  return getFlashcardClassIdRecord(pool, cardId);
}

export async function updateFlashcard(pool, {
  cardId,
  classId,
  userId,
  question,
  answer,
}) {
  const card = await updateFlashcardRecord(pool, {
    cardId,
    classId,
    userId,
    question,
    answer,
  });
  if (!card) {
    throw new HttpError(403, "PERMISSAO_NEGADA", "apenas o dono pode editar este flashcard");
  }
  return { card };
}

export async function deleteFlashcard(pool, {
  cardId,
  classId,
  userId,
}) {
  const deleted = await deleteFlashcardRecord(pool, {
    cardId,
    classId,
    userId,
  });
  if (!deleted) {
    throw new HttpError(403, "PERMISSAO_NEGADA", "apenas o dono pode excluir este flashcard");
  }
  return { deleted: true };
}

export async function reviewFlashcard(pool, values) {
  const result = await createReview(pool, values);
  if (result.result === "not_found") {
    throw new HttpError(404, "NAO_ENCONTRADO", "não encontrado");
  }
  if (result.result === "not_due") {
    throw new HttpError(
      409,
      "REVISAO_AINDA_NAO_LIBERADA",
      "esta revisão ainda não está liberada",
    );
  }
  return { review: result.review };
}

export async function getWeeklyPerformance(pool, classId, userId) {
  return getWeeklyPerformanceRecord(pool, classId, userId);
}

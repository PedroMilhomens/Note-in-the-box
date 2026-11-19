import { calculateNextDueAt } from "./schedule.js";

function mapFlashcard(row) {
  return {
    id: row.id,
    classId: row.class_id,
    question: row.question,
    answer: row.answer,
    noteId: row.note_id,
    noteTitle: row.note_title ?? null,
    createdAt: row.created_at,
    nextDueAt: row.next_due_at ?? null,
  };
}

export async function listFlashcards(pool, classId, userId, { limit, offset }) {
  const result = await pool.query(
    `SELECT f.id, f.class_id, f.question, f.answer, f.note_id,
            n.title AS note_title, f.created_at, latest.next_due_at
     FROM flashcards f
     LEFT JOIN LATERAL (
       SELECT n.title
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = f.note_id AND b.class_id = f.class_id
         AND n.deleted_at IS NULL
     ) n ON true
     LEFT JOIN LATERAL (
       SELECT r.next_due_at
       FROM flashcard_reviews r
       WHERE r.card_id = f.id AND r.user_id = $2
       ORDER BY r.reviewed_at DESC, r.id DESC
       LIMIT 1
     ) latest ON true
     WHERE f.class_id = $1
     ORDER BY f.created_at DESC, f.id
     LIMIT $3 OFFSET $4`,
    [classId, userId, limit, offset],
  );
  return result.rows.map(mapFlashcard);
}

export async function listDueFlashcards(pool, classId, userId, { limit, offset }) {
  const result = await pool.query(
    `SELECT f.id, f.class_id, f.question, f.answer, f.note_id,
            n.title AS note_title, f.created_at, latest.next_due_at
     FROM flashcards f
     LEFT JOIN LATERAL (
       SELECT n.title
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = f.note_id AND b.class_id = f.class_id
         AND n.deleted_at IS NULL
     ) n ON true
     LEFT JOIN LATERAL (
       SELECT r.next_due_at
       FROM flashcard_reviews r
       WHERE r.card_id = f.id AND r.user_id = $2
       ORDER BY r.reviewed_at DESC, r.id DESC
       LIMIT 1
     ) latest ON true
     WHERE f.class_id = $1
       AND (latest.next_due_at IS NULL OR latest.next_due_at <= now())
     ORDER BY latest.next_due_at NULLS FIRST, f.created_at, f.id
     LIMIT $3 OFFSET $4`,
    [classId, userId, limit, offset],
  );
  return result.rows.map(mapFlashcard);
}

export async function createFlashcard(pool, {
  classId,
  ownerId,
  question,
  answer,
  noteId,
}) {
  const result = await pool.query(
    `INSERT INTO flashcards (class_id, owner_id, note_id, question, answer)
     SELECT c.id, $2, $5, $3, $4
     FROM classes c
     WHERE c.id = $1
       AND (
         $5::uuid IS NULL
         OR EXISTS (
           SELECT 1
           FROM notes n
           JOIN branches b ON b.id = n.branch_id
           WHERE n.id = $5 AND b.class_id = c.id
             AND n.deleted_at IS NULL
         )
       )
     RETURNING id, class_id, question, answer, note_id, created_at`,
    [classId, ownerId, question, answer, noteId],
  );
  return result.rows[0] ? mapFlashcard(result.rows[0]) : null;
}

export async function getFlashcardClassId(pool, cardId) {
  const result = await pool.query(
    "SELECT class_id FROM flashcards WHERE id = $1",
    [cardId],
  );
  return result.rows[0]?.class_id ?? null;
}

export async function createReview(pool, {
  cardId,
  classId,
  userId,
  rating,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cardResult = await client.query(
      `SELECT id
       FROM flashcards
       WHERE id = $1 AND class_id = $2
       FOR UPDATE`,
      [cardId, classId],
    );
    if (cardResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return { result: "not_found" };
    }

    const previousResult = await client.query(
      `SELECT reviewed_at, next_due_at
       FROM flashcard_reviews
       WHERE card_id = $1 AND user_id = $2
       ORDER BY reviewed_at DESC, id DESC
       LIMIT 1`,
      [cardId, userId],
    );
    const previous = previousResult.rows[0];
    const reviewedAt = new Date();
    if (previous && new Date(previous.next_due_at) > reviewedAt) {
      await client.query("ROLLBACK");
      return { result: "not_due" };
    }
    const nextDueAt = calculateNextDueAt(
      rating,
      previous
        ? {
          reviewedAt: previous.reviewed_at,
          nextDueAt: previous.next_due_at,
        }
        : null,
      reviewedAt,
    );
    const reviewResult = await client.query(
      `INSERT INTO flashcard_reviews
         (card_id, user_id, rating, reviewed_at, next_due_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING card_id, rating, reviewed_at, next_due_at`,
      [cardId, userId, rating, reviewedAt, nextDueAt],
    );
    await client.query("COMMIT");
    const row = reviewResult.rows[0];
    return {
      result: "ok",
      review: {
        cardId: row.card_id,
        rating: row.rating,
        reviewedAt: row.reviewed_at,
        nextDueAt: row.next_due_at,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getWeeklyPerformance(pool, classId, userId) {
  const result = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         (now() AT TIME ZONE 'UTC')::date - 6,
         (now() AT TIME ZONE 'UTC')::date,
         interval '1 day'
       )::date AS review_date
     ),
     daily AS (
       SELECT (r.reviewed_at AT TIME ZONE 'UTC')::date AS review_date,
              count(*)::int AS total,
              count(*) FILTER (WHERE r.rating = 'errei')::int AS errei,
              count(*) FILTER (WHERE r.rating = 'dificil')::int AS dificil,
              count(*) FILTER (WHERE r.rating = 'bom')::int AS bom,
              count(*) FILTER (WHERE r.rating = 'facil')::int AS facil
       FROM flashcard_reviews r
       JOIN flashcards f ON f.id = r.card_id
       WHERE f.class_id = $1 AND r.user_id = $2
         AND r.reviewed_at >= (
           (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '6 days')
           AT TIME ZONE 'UTC'
         )
       GROUP BY (r.reviewed_at AT TIME ZONE 'UTC')::date
     )
     SELECT to_char(days.review_date, 'YYYY-MM-DD') AS date,
            COALESCE(daily.total, 0)::int AS total,
            COALESCE(daily.errei, 0)::int AS errei,
            COALESCE(daily.dificil, 0)::int AS dificil,
            COALESCE(daily.bom, 0)::int AS bom,
            COALESCE(daily.facil, 0)::int AS facil,
            sum(COALESCE(daily.total, 0)) OVER ()::int AS total_reviews
     FROM days
     LEFT JOIN daily ON daily.review_date = days.review_date
     ORDER BY days.review_date`,
    [classId, userId],
  );
  const days = result.rows.map((row) => ({
    date: row.date,
    total: row.total,
    ratings: {
      errei: row.errei,
      dificil: row.dificil,
      bom: row.bom,
      facil: row.facil,
    },
  }));
  return {
    totalReviews: result.rows[0]?.total_reviews ?? 0,
    days,
  };
}

export async function createNote(pool, {
  classId,
  branchId,
  userId,
  title,
  body,
  lessonDate,
  status,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const branchResult = await client.query(
      `SELECT owner_id
       FROM branches
       WHERE id = $1 AND class_id = $2
       FOR UPDATE`,
      [branchId, classId],
    );
    const branch = branchResult.rows[0];
    if (!branch) {
      await client.query("ROLLBACK");
      return { result: "not_found" };
    }
    if (branch.owner_id !== userId) {
      await client.query("ROLLBACK");
      return { result: "forbidden" };
    }

    const noteResult = await client.query(
      `INSERT INTO notes (branch_id, title, body, lesson_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, branch_id, title, body,
                 lesson_date::text AS lesson_date, status, updated_at`,
      [branchId, title, body, lessonDate, status],
    );
    const note = noteResult.rows[0];
    await client.query(
      "INSERT INTO note_versions (note_id, body) VALUES ($1, $2)",
      [note.id, note.body],
    );
    await client.query("COMMIT");
    return { result: "ok", note: mapNote(note) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listBranchNotes(pool, classId, branchId, {
  limit,
  offset,
}) {
  const result = await pool.query(
    `SELECT n.id, n.branch_id, n.title,
            n.lesson_date::text AS lesson_date, n.status, n.updated_at,
            u.name AS owner_name
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     JOIN users u ON u.id = b.owner_id
     WHERE b.class_id = $1
       AND b.id = $2
       AND n.deleted_at IS NULL
     ORDER BY n.lesson_date DESC NULLS LAST, n.updated_at DESC, n.id
     LIMIT $3 OFFSET $4`,
    [classId, branchId, limit, offset],
  );
  return result.rows.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    title: row.title,
    lessonDate: row.lesson_date,
    status: row.status,
    updatedAt: row.updated_at,
    ownerName: row.owner_name,
  }));
}

export async function readNote(pool, classId, noteId) {
  const result = await pool.query(
    `SELECT n.id, n.branch_id, b.owner_id, u.name AS owner_name,
            n.title, n.body, n.lesson_date::text AS lesson_date,
            n.status, n.updated_at
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     JOIN users u ON u.id = b.owner_id
     WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL`,
    [noteId, classId],
  );
  const note = result.rows[0];
  return note ? {
    ...mapNote(note),
    ownerId: note.owner_id,
    ownerName: note.owner_name,
  } : null;
}

export async function updateNote(pool, {
  classId,
  noteId,
  userId,
  fields,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT n.id, n.branch_id, b.owner_id, n.title, n.body,
              n.lesson_date::text AS lesson_date, n.status
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR UPDATE OF n`,
      [noteId, classId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { result: "not_found" };
    }
    if (current.owner_id !== userId) {
      await client.query("ROLLBACK");
      return { result: "forbidden" };
    }

    const updated = {
      title: fields.title ?? current.title,
      body: fields.body ?? current.body,
      lessonDate: fields.lessonDate === undefined
        ? current.lesson_date
        : fields.lessonDate,
      status: fields.status ?? current.status,
    };
    const noteResult = await client.query(
      `UPDATE notes
       SET title = $2, body = $3, lesson_date = $4, status = $5, updated_at = now()
       WHERE id = $1
       RETURNING id, branch_id, title, body,
                 lesson_date::text AS lesson_date, status, updated_at`,
      [
        noteId,
        updated.title,
        updated.body,
        updated.lessonDate,
        updated.status,
      ],
    );
    const note = noteResult.rows[0];
    await client.query(
      "INSERT INTO note_versions (note_id, body) VALUES ($1, $2)",
      [note.id, note.body],
    );
    await client.query("COMMIT");
    return { result: "ok", note: mapNote(note) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteNote(pool, { classId, noteId, userId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT n.id, b.owner_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR UPDATE OF n`,
      [noteId, classId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return "not_found";
    }
    if (current.owner_id !== userId) {
      await client.query("ROLLBACK");
      return "forbidden";
    }
    await client.query(
      "UPDATE notes SET deleted_at = now() WHERE id = $1",
      [noteId],
    );
    await client.query("COMMIT");
    return "ok";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listMissedLessons(pool, classId, userId, {
  limit,
  offset,
}) {
  const result = await pool.query(
    `WITH own_branch AS (
       SELECT id
       FROM branches
       WHERE class_id = $1 AND owner_id = $2
     ),
     missed_dates AS (
       SELECT DISTINCT peer.lesson_date
       FROM notes peer
       JOIN branches peer_branch ON peer_branch.id = peer.branch_id
       WHERE peer_branch.class_id = $1
         AND peer_branch.owner_id <> $2
         AND peer.deleted_at IS NULL
         AND peer.lesson_date < CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1
           FROM notes own_note
           JOIN own_branch ON own_branch.id = own_note.branch_id
           WHERE own_note.deleted_at IS NULL
             AND own_note.lesson_date = peer.lesson_date
         )
     ),
     page AS (
       SELECT lesson_date
       FROM missed_dates
       ORDER BY lesson_date DESC
       LIMIT $3 OFFSET $4
     )
     SELECT page.lesson_date::text AS lesson_date,
            COALESCE(
              json_agg(
                json_build_object(
                  'noteId', suggestion.id,
                  'branchId', suggestion.branch_id,
                  'title', suggestion.title,
                  'ownerName', suggestion.owner_name,
                  'updatedAt', suggestion.updated_at
                )
                ORDER BY suggestion.updated_at DESC, suggestion.id
              ) FILTER (WHERE suggestion.id IS NOT NULL),
              '[]'::json
            ) AS suggestions
     FROM page
     LEFT JOIN LATERAL (
       SELECT n.id, b.id AS branch_id, n.title, u.name AS owner_name,
              n.updated_at
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       JOIN users u ON u.id = b.owner_id
       WHERE b.class_id = $1
         AND b.owner_id <> $2
         AND n.lesson_date = page.lesson_date
         AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC, n.id
       LIMIT 5
     ) suggestion ON true
     GROUP BY page.lesson_date
     ORDER BY page.lesson_date DESC`,
    [classId, userId, limit, offset],
  );
  return result.rows.map((row) => ({
    lessonDate: row.lesson_date,
    suggestions: row.suggestions,
  }));
}

function mapNote(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    title: row.title,
    body: row.body,
    lessonDate: row.lesson_date,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function listNoteReferences(pool, classId, noteId, {
  limit,
  offset,
}) {
  const source = await findNoteInClass(pool, classId, noteId);
  if (!source) return null;

  const result = await pool.query(
    `SELECT target.id AS note_id, target.title, target_branch.id AS branch_id,
            owner.name AS owner_name,
            target.lesson_date::text AS lesson_date, target.updated_at
     FROM note_links links
     JOIN notes target ON target.id = links.to_note_id
     JOIN branches target_branch ON target_branch.id = target.branch_id
     JOIN users owner ON owner.id = target_branch.owner_id
     WHERE links.from_note_id = $1
       AND target_branch.class_id = $2
       AND target.deleted_at IS NULL
     ORDER BY target.title, target.id
     LIMIT $3 OFFSET $4`,
    [noteId, classId, limit, offset],
  );
  return result.rows.map(mapReference);
}

export async function addNoteReference(pool, {
  classId,
  sourceNoteId,
  targetNoteId,
  userId,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sourceResult = await client.query(
      `SELECT b.id AS branch_id, b.owner_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR UPDATE OF n`,
      [sourceNoteId, classId],
    );
    const source = sourceResult.rows[0];
    if (!source) {
      await client.query("ROLLBACK");
      return { result: "not_found" };
    }
    if (source.owner_id !== userId) {
      await client.query("ROLLBACK");
      return { result: "forbidden" };
    }

    const targetResult = await client.query(
      `SELECT n.id, n.title, b.id AS branch_id, u.name AS owner_name,
              n.lesson_date::text AS lesson_date, n.updated_at
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       JOIN users u ON u.id = b.owner_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR SHARE OF n`,
      [targetNoteId, classId],
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return { result: "not_found" };
    }
    if (source.branch_id === target.branch_id) {
      await client.query("ROLLBACK");
      return { result: "same_branch" };
    }

    const inserted = await client.query(
      `INSERT INTO note_links (from_note_id, to_note_id)
       VALUES ($1, $2)
       ON CONFLICT (from_note_id, to_note_id) DO NOTHING
       RETURNING from_note_id`,
      [sourceNoteId, targetNoteId],
    );
    await client.query("COMMIT");
    return {
      result: "ok",
      created: inserted.rowCount === 1,
      reference: mapReference(target),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteNoteReference(pool, {
  classId,
  sourceNoteId,
  targetNoteId,
  userId,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sourceResult = await client.query(
      `SELECT b.owner_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR UPDATE OF n`,
      [sourceNoteId, classId],
    );
    const source = sourceResult.rows[0];
    if (!source) {
      await client.query("ROLLBACK");
      return "not_found";
    }
    if (source.owner_id !== userId) {
      await client.query("ROLLBACK");
      return "forbidden";
    }
    const targetResult = await client.query(
      `SELECT b.id AS branch_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL
       FOR SHARE OF n`,
      [targetNoteId, classId],
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return "not_found";
    }
    const deleted = await client.query(
      `DELETE FROM note_links
       WHERE from_note_id = $1 AND to_note_id = $2`,
      [sourceNoteId, targetNoteId],
    );
    await client.query("COMMIT");
    return deleted.rowCount > 0 ? "ok" : "not_found";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listReferenceCandidates(pool, classId, sourceNoteId, {
  limit,
  offset,
}) {
  const source = await findNoteInClass(pool, classId, sourceNoteId);
  if (!source) return null;

  const result = await pool.query(
    `SELECT n.id, n.title, b.id AS branch_id, u.name AS owner_name,
            n.lesson_date::text AS lesson_date, n.updated_at
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     JOIN users u ON u.id = b.owner_id
     WHERE b.class_id = $1
       AND b.id <> $2
       AND n.id <> $3
       AND n.deleted_at IS NULL
     ORDER BY n.updated_at DESC, n.id
     LIMIT $4 OFFSET $5`,
    [classId, source.branch_id, sourceNoteId, limit, offset],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    branchId: row.branch_id,
    ownerName: row.owner_name,
    lessonDate: row.lesson_date,
    updatedAt: row.updated_at,
  }));
}

export async function getNoteNeighborhood(pool, classId, rootNoteId, {
  limit,
  offset,
}) {
  const root = await findNoteInClass(pool, classId, rootNoteId);
  if (!root) return null;

  const edgesResult = await pool.query(
    `SELECT links.from_note_id, links.to_note_id
     FROM note_links links
     JOIN notes source ON source.id = links.from_note_id
     JOIN branches source_branch ON source_branch.id = source.branch_id
     JOIN notes target ON target.id = links.to_note_id
     JOIN branches target_branch ON target_branch.id = target.branch_id
     WHERE source_branch.class_id = $1
       AND target_branch.class_id = $1
       AND source.deleted_at IS NULL
       AND target.deleted_at IS NULL
       AND (source.id = $2 OR target.id = $2)
     ORDER BY links.from_note_id, links.to_note_id
     LIMIT $3 OFFSET $4`,
    [classId, rootNoteId, limit, offset],
  );
  const edges = edgesResult.rows.map((row) => ({
    fromNoteId: row.from_note_id,
    toNoteId: row.to_note_id,
  }));
  const noteIds = [...new Set([
    rootNoteId,
    ...edges.flatMap((edge) => [edge.fromNoteId, edge.toNoteId]),
  ])];
  const nodesResult = await pool.query(
    `SELECT n.id, n.title, b.id AS branch_id, u.name AS owner_name
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     JOIN users u ON u.id = b.owner_id
     WHERE b.class_id = $1
       AND n.id = ANY($2::uuid[])
       AND n.deleted_at IS NULL`,
    [classId, noteIds],
  );
  return {
    nodes: nodesResult.rows.map((node) => ({
      id: node.id,
      title: node.title,
      branchId: node.branch_id,
      ownerName: node.owner_name,
      isRoot: node.id === rootNoteId,
    })),
    edges,
  };
}

async function findNoteInClass(pool, classId, noteId) {
  const result = await pool.query(
    `SELECT b.id AS branch_id
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     WHERE n.id = $1 AND b.class_id = $2 AND n.deleted_at IS NULL`,
    [noteId, classId],
  );
  return result.rows[0] ?? null;
}

function mapReference(row) {
  return {
    noteId: row.note_id ?? row.id,
    title: row.title,
    branchId: row.branch_id,
    ownerName: row.owner_name,
    lessonDate: row.lesson_date,
    updatedAt: row.updated_at,
  };
}

import { randomBytes } from "node:crypto";

export async function createClass(pool, {
  userId,
  name,
  professorName,
  inviteCode,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const classResult = await client.query(
      `INSERT INTO classes (name, professor_name, invite_code, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, professor_name, rules, created_at`,
      [name, professorName, inviteCode, userId],
    );
    const createdClass = classResult.rows[0];
    await client.query(
      `INSERT INTO class_members (class_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [createdClass.id, userId],
    );
    const branchResult = await client.query(
      `INSERT INTO branches (class_id, owner_id)
       VALUES ($1, $2)
       RETURNING id`,
      [createdClass.id, userId],
    );
    await client.query("COMMIT");
    return {
      class: mapClass(createdClass),
      branchId: branchResult.rows[0].id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function joinClass(pool, { userId, inviteCode }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const classResult = await client.query(
      `SELECT id, name, professor_name, rules, created_at
       FROM classes
       WHERE invite_code = $1
       FOR UPDATE`,
      [inviteCode],
    );
    const foundClass = classResult.rows[0];
    if (!foundClass) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `INSERT INTO class_members (class_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (class_id, user_id) DO NOTHING`,
      [foundClass.id, userId],
    );
    const branchResult = await client.query(
      `INSERT INTO branches (class_id, owner_id)
       VALUES ($1, $2)
       ON CONFLICT (class_id, owner_id) DO NOTHING
       RETURNING id`,
      [foundClass.id, userId],
    );
    const branch = branchResult.rows[0] ?? (await client.query(
      `SELECT id
       FROM branches
       WHERE class_id = $1 AND owner_id = $2`,
      [foundClass.id, userId],
    )).rows[0];
    await client.query("COMMIT");
    return {
      class: mapClass(foundClass),
      branchId: branch.id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function isClassMember(pool, classId, userId) {
  const result = await pool.query(
    `SELECT 1
     FROM class_members
     WHERE class_id = $1 AND user_id = $2`,
    [classId, userId],
  );
  return result.rowCount > 0;
}

export async function listUserClasses(pool, userId, { limit, offset }) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.professor_name, c.rules, c.created_at,
            cm.role, b.id AS branch_id,
            (SELECT count(*)::int FROM class_members m
              WHERE m.class_id = c.id) AS member_count,
            (SELECT count(*)::int FROM branches cb
              WHERE cb.class_id = c.id) AS branch_count,
            (SELECT count(*)::int FROM notes n
              JOIN branches nb ON nb.id = n.branch_id
              WHERE nb.class_id = c.id AND n.deleted_at IS NULL) AS note_count,
            (SELECT count(*)::int FROM flashcards f
              LEFT JOIN LATERAL (
                SELECT r.next_due_at
                FROM flashcard_reviews r
                WHERE r.card_id = f.id AND r.user_id = cm.user_id
                ORDER BY r.reviewed_at DESC, r.id DESC
                LIMIT 1
              ) latest ON true
              WHERE f.class_id = c.id
                AND (latest.next_due_at IS NULL OR latest.next_due_at <= now())
            ) AS due_flashcards
     FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     JOIN branches b ON b.class_id = c.id AND b.owner_id = cm.user_id
     WHERE cm.user_id = $1
     ORDER BY cm.joined_at DESC, c.id
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return result.rows.map((row) => ({
    ...mapClass(row),
    role: row.role,
    branchId: row.branch_id,
    memberCount: row.member_count,
    branchCount: row.branch_count,
    noteCount: row.note_count,
    dueFlashcards: row.due_flashcards,
  }));
}

export async function getClassDetails(pool, classId, { limit, offset }) {
  const classResult = await pool.query(
    `SELECT id, name, professor_name, rules, created_at
     FROM classes
     WHERE id = $1`,
    [classId],
  );
  const foundClass = classResult.rows[0];
  if (!foundClass) return null;

  const membersResult = await pool.query(
    `SELECT u.id, u.name, cm.role, cm.joined_at
     FROM class_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.class_id = $1
     ORDER BY cm.joined_at, u.id
     LIMIT $2 OFFSET $3`,
    [classId, limit, offset],
  );
  const branchesResult = await pool.query(
    `SELECT b.id, b.owner_id, u.name AS owner_name,
            (SELECT count(*)::int FROM notes n
              WHERE n.branch_id = b.id AND n.deleted_at IS NULL) AS note_count,
            (SELECT max(n.updated_at) FROM notes n
              WHERE n.branch_id = b.id AND n.deleted_at IS NULL) AS last_note_at
     FROM branches b
     JOIN users u ON u.id = b.owner_id
     WHERE b.class_id = $1
     ORDER BY u.name, b.id
     LIMIT $2 OFFSET $3`,
    [classId, limit, offset],
  );

  return {
    class: mapClass(foundClass),
    members: membersResult.rows.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      joinedAt: member.joined_at,
    })),
    branches: branchesResult.rows.map((branch) => ({
      id: branch.id,
      ownerId: branch.owner_id,
      ownerName: branch.owner_name,
      noteCount: branch.note_count,
      lastNoteAt: branch.last_note_at,
    })),
  };
}

export async function getClassInviteCode(pool, classId, userId) {
  const result = await pool.query(
    `SELECT invite_code
     FROM classes c
     WHERE c.id = $1
       AND EXISTS (
         SELECT 1
         FROM class_members cm
         WHERE cm.class_id = c.id
           AND cm.user_id = $2
           AND cm.role = 'owner'
       )`,
    [classId, userId],
  );
  return result.rows[0]?.invite_code ?? null;
}

export async function regenerateClassInviteCode(pool, classId, userId) {
  const inviteCode = randomBytes(32).toString("base64url");
  const result = await pool.query(
    `UPDATE classes c
     SET invite_code = $3
     WHERE c.id = $1
       AND EXISTS (
         SELECT 1
         FROM class_members cm
         WHERE cm.class_id = c.id
           AND cm.user_id = $2
           AND cm.role = 'owner'
       )
     RETURNING invite_code`,
    [classId, userId, inviteCode],
  );
  return result.rows[0]?.invite_code ?? null;
}

export async function updateClassRules(pool, {
  classId,
  userId,
  rules,
}) {
  const result = await pool.query(
    `UPDATE classes c
     SET rules = $3
     WHERE c.id = $1
       AND EXISTS (
         SELECT 1
         FROM class_members cm
         WHERE cm.class_id = c.id
           AND cm.user_id = $2
           AND cm.role = 'owner'
       )
     RETURNING c.id, c.name, c.professor_name, c.rules, c.created_at`,
    [classId, userId, rules],
  );
  return result.rows[0] ? mapClass(result.rows[0]) : null;
}

function mapClass(row) {
  return {
    id: row.id,
    name: row.name,
    professorName: row.professor_name,
    rules: row.rules ?? "",
    createdAt: row.created_at,
  };
}

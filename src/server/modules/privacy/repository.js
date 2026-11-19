import { randomBytes } from "node:crypto";
import { isStorageKey } from "../notes/collaboration-service.js";

export async function listConsents(pool, userId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (kind) kind, version, granted_at, revoked_at
     FROM consents
     WHERE user_id = $1
     ORDER BY kind, granted_at DESC, id DESC`,
    [userId],
  );
  return result.rows.map((row) => ({
    kind: row.kind,
    version: row.version,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
  }));
}

export async function exportUserData(pool, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const profileResult = await client.query(
      `SELECT id, created_at, name, email, institution, course
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const profile = profileResult.rows[0];
    if (!profile) {
      await client.query("COMMIT");
      return null;
    }

    const consents = await client.query(
      `SELECT kind, version, granted_at, revoked_at
       FROM consents
       WHERE user_id = $1
       ORDER BY kind, granted_at`,
      [userId],
    );
    const classMemberships = await client.query(
      `SELECT class_id, role, joined_at
       FROM class_members
       WHERE user_id = $1
       ORDER BY joined_at, class_id`,
      [userId],
    );
    const branches = await client.query(
      `SELECT id, class_id
       FROM branches
       WHERE owner_id = $1
       ORDER BY class_id, id`,
      [userId],
    );
    const notes = await client.query(
      `SELECT n.id, b.class_id, n.branch_id, n.title, n.body,
              n.lesson_date, n.status, n.created_at, n.updated_at,
              n.deleted_at
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE b.owner_id = $1
       ORDER BY n.created_at, n.id`,
      [userId],
    );
    const noteVersions = await client.query(
      `SELECT v.id, v.note_id, v.body, v.created_at
       FROM note_versions v
       JOIN notes n ON n.id = v.note_id
       JOIN branches b ON b.id = n.branch_id
       WHERE b.owner_id = $1
       ORDER BY v.created_at, v.id`,
      [userId],
    );
    const comments = await client.query(
      `SELECT id, note_id, body, created_at, deleted_at
       FROM comments
       WHERE author_id = $1
       ORDER BY created_at, id`,
      [userId],
    );
    const forumTopics = await client.query(
      `SELECT id, class_id, title, body, note_id, created_at, deleted_at
       FROM forum_topics
       WHERE author_id = $1
       ORDER BY created_at, id`,
      [userId],
    );
    const forumPosts = await client.query(
      `SELECT p.id, p.topic_id, t.class_id, p.body, p.created_at,
              p.deleted_at
       FROM forum_posts p
       JOIN forum_topics t ON t.id = p.topic_id
       WHERE p.author_id = $1
       ORDER BY p.created_at, p.id`,
      [userId],
    );
    const flashcards = await client.query(
      `SELECT id, class_id, note_id, question, answer, created_at
       FROM flashcards
       WHERE owner_id = $1
       ORDER BY created_at, id`,
      [userId],
    );
    const flashcardReviews = await client.query(
      `SELECT id, card_id, rating, reviewed_at, next_due_at
       FROM flashcard_reviews
       WHERE user_id = $1
       ORDER BY reviewed_at, id`,
      [userId],
    );
    const pomodoroSessions = await client.query(
      `SELECT id, class_id, kind, started_at, duration_s, completed
       FROM pomodoro_sessions
       WHERE user_id = $1
       ORDER BY started_at, id`,
      [userId],
    );
    const reports = await client.query(
      `SELECT id, target_type, target_id, reason, status, created_at
       FROM reports
       WHERE reporter_id = $1
       ORDER BY created_at, id`,
      [userId],
    );
    const auditLog = await client.query(
      `SELECT action, target_type, created_at
       FROM audit_log
       WHERE actor_id = $1
       ORDER BY created_at, id`,
      [userId],
    );
    const attachments = await client.query(
      `SELECT a.id, a.note_id, a.filename, a.mime_type, a.size_bytes,
              a.storage_key, a.created_at
       FROM attachments a
       JOIN notes n ON n.id = a.note_id
       JOIN branches b ON b.id = n.branch_id
       WHERE b.owner_id = $1
       ORDER BY a.created_at, a.id`,
      [userId],
    );
    await client.query("COMMIT");

    return {
      format: "note-in-the-box-data-v1",
      exportedAt: new Date().toISOString(),
      profile: {
        id: profile.id,
        createdAt: profile.created_at,
        name: profile.name,
        email: profile.email,
        institution: profile.institution,
        course: profile.course,
      },
      consents: consents.rows.map((row) => ({
        kind: row.kind,
        version: row.version,
        grantedAt: row.granted_at,
        revokedAt: row.revoked_at,
      })),
      classMemberships: classMemberships.rows.map((row) => ({
        classId: row.class_id,
        role: row.role,
        joinedAt: row.joined_at,
      })),
      branches: branches.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
      })),
      notes: notes.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        branchId: row.branch_id,
        title: row.title,
        body: row.body,
        lessonDate: row.lesson_date,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      })),
      noteVersions: noteVersions.rows.map((row) => ({
        id: row.id,
        noteId: row.note_id,
        body: row.body,
        createdAt: row.created_at,
      })),
      comments: comments.rows.map((row) => ({
        id: row.id,
        noteId: row.note_id,
        body: row.body,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
      })),
      forumTopics: forumTopics.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        title: row.title,
        body: row.body,
        noteId: row.note_id,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
      })),
      forumPosts: forumPosts.rows.map((row) => ({
        id: row.id,
        topicId: row.topic_id,
        classId: row.class_id,
        body: row.body,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
      })),
      flashcards: flashcards.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        noteId: row.note_id,
        question: row.question,
        answer: row.answer,
        createdAt: row.created_at,
      })),
      flashcardReviews: flashcardReviews.rows.map((row) => ({
        id: row.id,
        cardId: row.card_id,
        rating: row.rating,
        reviewedAt: row.reviewed_at,
        nextDueAt: row.next_due_at,
      })),
      pomodoroSessions: pomodoroSessions.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        kind: row.kind,
        startedAt: row.started_at,
        durationS: row.duration_s,
        completed: row.completed,
      })),
      reports: reports.rows.map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
      })),
      auditLog: auditLog.rows.map((row) => ({
        action: row.action,
        targetType: row.target_type,
        createdAt: row.created_at,
      })),
      attachments: attachments.rows.map((row) => ({
        id: row.id,
        noteId: row.note_id,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        storageKey: row.storage_key,
      })),
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original query error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProfile(pool, userId, fields) {
  const columnNames = {
    name: "name",
    email: "email",
    institution: "institution",
    course: "course",
  };
  const entries = Object.entries(fields);
  if (entries.some(([field]) => !Object.hasOwn(columnNames, field))) {
    throw new TypeError("Campo de perfil não permitido");
  }
  const assignments = entries.map(([field], index) => (
    `${columnNames[field]} = $${index + 2}`
  ));
  const values = [userId, ...entries.map(([, value]) => value)];
  const result = await pool.query(
    `UPDATE users
     SET ${assignments.join(", ")}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, email, institution, course`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function revokeConsent(pool, userId, kind) {
  const result = await pool.query(
    `UPDATE consents
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE id = (
       SELECT id FROM consents
       WHERE user_id = $1 AND kind = $2
       ORDER BY granted_at DESC, id DESC
       LIMIT 1
     )
     RETURNING kind, version, granted_at, revoked_at`,
    [userId, kind],
  );
  const consent = result.rows[0];
  return consent ? {
    kind: consent.kind,
    version: consent.version,
    grantedAt: consent.granted_at,
    revokedAt: consent.revoked_at,
  } : null;
}

export async function anonymizeAccount(pool, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [userId],
    );
    if (!user.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }

    const ownerClasses = await client.query(
      `SELECT class_id
       FROM class_members
       WHERE user_id = $1 AND role = 'owner'
       ORDER BY class_id
       FOR UPDATE`,
      [userId],
    );
    for (const { class_id: classId } of ownerClasses.rows) {
      const currentOwner = await client.query(
        `SELECT cm.user_id
         FROM class_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.class_id = $1 AND cm.role = 'owner'
           AND cm.user_id <> $2 AND u.deleted_at IS NULL
         LIMIT 1`,
        [classId, userId],
      );
      if (currentOwner.rowCount > 0) continue;

      const nextOwner = await client.query(
        `SELECT cm.user_id
         FROM class_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.class_id = $1 AND cm.user_id <> $2
           AND u.deleted_at IS NULL
         ORDER BY cm.joined_at, cm.user_id
         LIMIT 1
         FOR UPDATE OF cm`,
        [classId, userId],
      );
      if (nextOwner.rows[0]) {
        await client.query(
          `UPDATE class_members
           SET role = 'owner'
           WHERE class_id = $1 AND user_id = $2`,
          [classId, nextOwner.rows[0].user_id],
        );
      }
    }

    await client.query(
      "UPDATE classes SET created_by = NULL WHERE created_by = $1",
      [userId],
    );
    await client.query(
      "DELETE FROM class_members WHERE user_id = $1",
      [userId],
    );
    await client.query(
      "UPDATE comments SET author_id = NULL WHERE author_id = $1",
      [userId],
    );
    await client.query(
      "UPDATE forum_topics SET author_id = NULL WHERE author_id = $1",
      [userId],
    );
    await client.query(
      "UPDATE forum_posts SET author_id = NULL WHERE author_id = $1",
      [userId],
    );
    await client.query(
      "UPDATE audit_log SET actor_id = NULL, target_id = NULL WHERE actor_id = $1 OR target_id = $1",
      [userId],
    );
    await client.query("DELETE FROM reports WHERE reporter_id = $1", [userId]);
    await client.query(
      "DELETE FROM flashcard_reviews WHERE user_id = $1",
      [userId],
    );
    await client.query(
      "DELETE FROM pomodoro_sessions WHERE user_id = $1",
      [userId],
    );
    await client.query("DELETE FROM consents WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await client.query(
      `UPDATE users
       SET name = 'Usuário removido',
           email = $2,
           password_hash = $3,
           institution = NULL,
           course = NULL,
           deleted_at = now()
       WHERE id = $1`,
      [
        userId,
        `removed+${userId}@invalid.example`,
        randomBytes(32).toString("base64url"),
      ],
    );
    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id)
       VALUES (NULL, 'account_anonymized', 'user', NULL)`,
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original query error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function purgeAnonymizedAccounts(pool, cutoff) {
  const before = cutoff instanceof Date ? cutoff : new Date(cutoff);
  if (
    Number.isNaN(before.getTime())
    || before.getTime() > Date.now()
  ) {
    throw new TypeError("RETENTION_CUTOFF deve ser uma data passada válida");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attachments = await client.query(
      `SELECT a.storage_key
       FROM attachments a
       JOIN notes n ON n.id = a.note_id
       JOIN branches b ON b.id = n.branch_id
       JOIN users u ON u.id = b.owner_id
       WHERE u.deleted_at < $1
       FOR UPDATE OF u`,
      [before],
    );
    const storageKeys = [...new Set(
      attachments.rows.map((row) => row.storage_key),
    )];
    if (storageKeys.some((key) => !isStorageKey(key))) {
      throw new Error("Chave de anexo inválida no armazenamento privado");
    }
    const result = await client.query(
      "DELETE FROM users WHERE deleted_at < $1 RETURNING id",
      [before],
    );
    await client.query("COMMIT");
    return { accountsDeleted: result.rowCount, storageKeys };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original query error.
    }
    throw error;
  } finally {
    client.release();
  }
}

function mapTopic(row) {
  return {
    id: row.id,
    classId: row.class_id,
    authorId: row.author_id,
    authorName: row.author_name ?? "Usuário removido",
    title: row.title,
    body: row.body,
    noteId: row.note_id,
    noteTitle: row.note_title,
    noteBranchId: row.note_branch_id,
    postCount: row.post_count,
    createdAt: row.created_at,
  };
}

function mapPost(row) {
  return {
    id: row.id,
    topicId: row.topic_id,
    authorId: row.author_id,
    authorName: row.author_name ?? "Usuário removido",
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function listTopics(pool, classId, { limit, offset }) {
  const result = await pool.query(
    `SELECT t.id, t.class_id, t.author_id, u.name AS author_name,
            t.title, left(t.body, 300) AS body,
            n.id AS note_id, n.title AS note_title,
            n.branch_id AS note_branch_id, t.created_at,
            count(p.id)::int AS post_count
     FROM forum_topics t
     LEFT JOIN users u ON u.id = t.author_id AND u.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT n.id, n.title, n.branch_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = t.note_id AND b.class_id = t.class_id
         AND n.deleted_at IS NULL
     ) n ON true
     LEFT JOIN forum_posts p
       ON p.topic_id = t.id AND p.deleted_at IS NULL
     WHERE t.class_id = $1 AND t.deleted_at IS NULL
     GROUP BY t.id, t.class_id, t.author_id, u.name, t.title, t.body,
              n.id, n.title, n.branch_id, t.created_at
     ORDER BY t.created_at DESC, t.id
     LIMIT $2 OFFSET $3`,
    [classId, limit, offset],
  );
  return result.rows.map((row) => mapTopic({ ...row, post_count: row.post_count }));
}

export async function listNoteCandidates(pool, classId, { limit, offset }) {
  const result = await pool.query(
    `SELECT n.id, n.title, n.branch_id, u.name AS owner_name
     FROM notes n
     JOIN branches b ON b.id = n.branch_id
     JOIN users u ON u.id = b.owner_id
     WHERE b.class_id = $1 AND n.deleted_at IS NULL
     ORDER BY n.title, n.id
     LIMIT $2 OFFSET $3`,
    [classId, limit, offset],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    branchId: row.branch_id,
    ownerName: row.owner_name,
  }));
}

export async function createTopic(pool, {
  classId,
  authorId,
  title,
  body,
  noteId,
}) {
  const result = await pool.query(
    `INSERT INTO forum_topics (class_id, author_id, title, body, note_id)
     SELECT c.id, $2, $3, $4, $5
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
     RETURNING id, class_id, author_id, title, body, note_id, created_at`,
    [classId, authorId, title, body, noteId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const details = await pool.query(
    `SELECT u.name AS author_name, n.title AS note_title,
            n.branch_id AS note_branch_id
     FROM users u
     LEFT JOIN LATERAL (
       SELECT n.title, n.branch_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = $2 AND b.class_id = $3
         AND n.deleted_at IS NULL
     ) n ON true
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [authorId, row.note_id, classId],
  );
  return mapTopic({
    ...row,
    author_name: details.rows[0]?.author_name,
    note_title: details.rows[0]?.note_title ?? null,
    note_branch_id: details.rows[0]?.note_branch_id ?? null,
    post_count: 0,
  });
}

export async function getTopicPosts(pool, classId, topicId, { limit, offset }) {
  const topicResult = await pool.query(
    `SELECT t.id, t.class_id, t.author_id, u.name AS author_name,
            t.title, t.body, n.id AS note_id, n.title AS note_title,
            n.branch_id AS note_branch_id, t.created_at,
            (SELECT count(*)::int
             FROM forum_posts p
             WHERE p.topic_id = t.id AND p.deleted_at IS NULL) AS post_count
     FROM forum_topics t
     LEFT JOIN users u ON u.id = t.author_id AND u.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT n.id, n.title, n.branch_id
       FROM notes n
       JOIN branches b ON b.id = n.branch_id
       WHERE n.id = t.note_id AND b.class_id = t.class_id
         AND n.deleted_at IS NULL
     ) n ON true
     WHERE t.id = $1 AND t.class_id = $2 AND t.deleted_at IS NULL`,
    [topicId, classId],
  );
  const topicRow = topicResult.rows[0];
  if (!topicRow) return null;

  const postsResult = await pool.query(
    `SELECT p.id, p.topic_id, p.author_id, u.name AS author_name,
            p.body, p.created_at
     FROM forum_posts p
     LEFT JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL
     WHERE p.topic_id = $1 AND p.deleted_at IS NULL
     ORDER BY p.created_at, p.id
     LIMIT $2 OFFSET $3`,
    [topicId, limit, offset],
  );
  return {
    topic: mapTopic(topicRow),
    posts: postsResult.rows.map(mapPost),
  };
}

export async function createPost(pool, {
  classId,
  topicId,
  authorId,
  body,
}) {
  const result = await pool.query(
    `INSERT INTO forum_posts (topic_id, author_id, body)
     SELECT t.id, $3, $4
     FROM forum_topics t
     WHERE t.id = $1 AND t.class_id = $2 AND t.deleted_at IS NULL
     RETURNING id, topic_id, author_id, body, created_at`,
    [topicId, classId, authorId, body],
  );
  if (result.rowCount === 0) return null;
  const post = result.rows[0];
  const author = await pool.query(
    "SELECT name FROM users WHERE id = $1 AND deleted_at IS NULL",
    [authorId],
  );
  return mapPost({ ...post, author_name: author.rows[0]?.name });
}

export async function deleteTopic(pool, {
  classId,
  topicId,
  userId,
}) {
  const result = await pool.query(
    `UPDATE forum_topics t
     SET deleted_at = now()
     WHERE t.id = $1 AND t.class_id = $2 AND t.deleted_at IS NULL
       AND (
         t.author_id = $3
         OR EXISTS (
           SELECT 1 FROM class_members cm
           WHERE cm.class_id = t.class_id
             AND cm.user_id = $3 AND cm.role = 'owner'
         )
       )
     RETURNING t.id`,
    [topicId, classId, userId],
  );
  if (result.rowCount > 0) return "ok";
  const exists = await pool.query(
    "SELECT 1 FROM forum_topics WHERE id = $1 AND class_id = $2 AND deleted_at IS NULL",
    [topicId, classId],
  );
  return exists.rowCount > 0 ? "forbidden" : "not_found";
}

export async function deletePost(pool, {
  classId,
  topicId,
  postId,
  userId,
}) {
  const result = await pool.query(
    `UPDATE forum_posts p
     SET deleted_at = now()
     FROM forum_topics t
     WHERE p.id = $1 AND p.topic_id = $2
       AND t.id = p.topic_id AND t.class_id = $3
       AND t.deleted_at IS NULL AND p.deleted_at IS NULL
       AND (
         p.author_id = $4
         OR EXISTS (
           SELECT 1 FROM class_members cm
           WHERE cm.class_id = t.class_id
             AND cm.user_id = $4 AND cm.role = 'owner'
         )
       )
     RETURNING p.id`,
    [postId, topicId, classId, userId],
  );
  if (result.rowCount > 0) return "ok";
  const exists = await pool.query(
    `SELECT 1
     FROM forum_posts p
     JOIN forum_topics t ON t.id = p.topic_id
     WHERE p.id = $1 AND p.topic_id = $2
       AND t.class_id = $3 AND t.deleted_at IS NULL
       AND p.deleted_at IS NULL`,
    [postId, topicId, classId],
  );
  return exists.rowCount > 0 ? "forbidden" : "not_found";
}

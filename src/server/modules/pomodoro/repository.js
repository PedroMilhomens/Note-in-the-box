export async function insertPomodoroSession(pool, {
  userId,
  classId,
  kind,
  startedAt,
  durationS,
  completed,
}) {
  const result = await pool.query(
    `INSERT INTO pomodoro_sessions
       (user_id, class_id, kind, started_at, duration_s, completed)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, class_id, kind, started_at, duration_s, completed`,
    [userId, classId, kind, startedAt, durationS, completed],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    classId: row.class_id,
    kind: row.kind,
    startedAt: row.started_at,
    durationS: row.duration_s,
    completed: row.completed,
  };
}

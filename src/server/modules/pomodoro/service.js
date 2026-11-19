import { insertPomodoroSession } from "./repository.js";

export async function recordPomodoroSession(pool, values) {
  const session = await insertPomodoroSession(pool, values);
  return { session };
}

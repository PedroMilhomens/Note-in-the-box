import pg from "pg";

export function createPool(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória");
  }

  return new pg.Pool({
    connectionString: databaseUrl,
  });
}

export async function query(pool, text, parameters = []) {
  if (!Array.isArray(parameters)) {
    throw new TypeError("Parâmetros devem ser uma lista");
  }

  return pool.query(text, parameters);
}

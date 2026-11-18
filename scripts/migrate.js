import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const migrationsDirectory = path.resolve("db/migrations");

export function compareMigrationNames(names) {
  return [...names].sort((left, right) => left.localeCompare(right, "en"));
}

export async function migrate(databaseUrl, poolFactory) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória");
  }

  if (!poolFactory) {
    const { default: pg } = await import("pg");
    poolFactory = () => new pg.Pool({ connectionString: databaseUrl });
  }

  const pool = poolFactory();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query(
      "SELECT name FROM schema_migrations",
    );
    const appliedNames = new Set(appliedResult.rows.map(({ name }) => name));
    const files = await fs.readdir(migrationsDirectory);
    const migrations = compareMigrationNames(
      files.filter((name) => /^\d+_.+\.sql$/.test(name)),
    );

    for (const migrationName of migrations) {
      if (appliedNames.has(migrationName)) {
        continue;
      }

      const sql = await fs.readFile(
        path.join(migrationsDirectory, migrationName),
        "utf8",
      );
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ($1)",
        [migrationName],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  await migrate(process.env.DATABASE_URL);
  process.stdout.write("Migrations aplicadas\n");
}

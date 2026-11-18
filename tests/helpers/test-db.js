import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createPool } from "../../src/server/db.js";
import { getMigrationDatabaseUrl } from "../../scripts/migrate.js";

if (!process.env.DATABASE_URL_TEST && existsSync(".env")) {
  loadEnvFile(".env");
}

export const testPool = createPool(
  getMigrationDatabaseUrl({ test: true }),
);

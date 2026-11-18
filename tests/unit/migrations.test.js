import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { compareMigrationNames, migrate } from "../../scripts/migrate.js";

test("migrations são ordenadas pelo prefixo numérico", () => {
  assert.deepEqual(
    compareMigrationNames(["002_notas.sql", "001_init.sql", "003_foro.sql"]),
    ["001_init.sql", "002_notas.sql", "003_foro.sql"],
  );
});

test("migration inicial usa UUID, pgcrypto e chaves estrangeiras", async () => {
  const sql = await fs.readFile(
    new URL("../../db/migrations/001_init.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pgcrypto/);
  assert.match(sql, /gen_random_uuid\(\)/);
  assert.match(sql, /REFERENCES users\(id\)/);
  assert.doesNotMatch(sql, /NOT NOT REFERENCES/);
});

test("migrator registra migration e não repete migration aplicada", async () => {
  const appliedNames = new Set();
  let transactionDepth = 0;
  let releaseCount = 0;
  let endCount = 0;

  const client = {
    async query(text, parameters = []) {
      if (text.includes("CREATE TABLE IF NOT EXISTS schema_migrations")) {
        return { rows: [] };
      }

      if (text.includes("SELECT name FROM schema_migrations")) {
        return {
          rows: [...appliedNames].map((name) => ({ name })),
        };
      }

      if (text.includes("INSERT INTO schema_migrations")) {
        appliedNames.add(parameters[0]);
      }

      if (text === "BEGIN") {
        transactionDepth += 1;
      }

      if (text === "COMMIT") {
        transactionDepth -= 1;
      }

      return { rows: [] };
    },
    release() {
      releaseCount += 1;
    },
  };

  const pool = {
    async connect() {
      return client;
    },
    async end() {
      endCount += 1;
    },
  };

  await migrate("postgresql://ficticio", () => pool);
  await migrate("postgresql://ficticio", () => pool);

  assert.equal(transactionDepth, 0);
  assert.equal(releaseCount, 2);
  assert.equal(endCount, 2);
  assert.deepEqual([...appliedNames], ["001_init.sql"]);
});

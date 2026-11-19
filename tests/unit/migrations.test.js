import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  compareMigrationNames,
  getMigrationDatabaseUrl,
  migrate,
} from "../../scripts/migrate.js";

test("migrations são ordenadas pelo prefixo numérico", () => {
  assert.deepEqual(
    compareMigrationNames(["002_notas.sql", "001_init.sql", "003_foro.sql"]),
    ["001_init.sql", "002_notas.sql", "003_foro.sql"],
  );
});

test("alvo de migration de teste exige banco separado identificado como teste", () => {
  assert.equal(
    getMigrationDatabaseUrl({
      test: true,
      env: {
        DATABASE_URL: "postgresql://localhost/noteapp_dev",
        DATABASE_URL_TEST: "postgresql://localhost/noteapp_test",
      },
    }),
    "postgresql://localhost/noteapp_test",
  );
  assert.throws(
    () => getMigrationDatabaseUrl({
      test: true,
      env: {
        DATABASE_URL: "postgresql://localhost/noteapp_test",
        DATABASE_URL_TEST: "postgresql://localhost/noteapp_test",
      },
    }),
    /não pode ser o banco de desenvolvimento/,
  );
  assert.throws(
    () => getMigrationDatabaseUrl({
      test: true,
      env: { DATABASE_URL_TEST: "postgresql://localhost/production" },
    }),
    /identificado como teste/,
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

test("migration complementar preenche metadados sem editar o schema inicial", async () => {
  const sql = await fs.readFile(
    new URL("../../db/migrations/002_complete_table_metadata.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /ALTER TABLE flashcard_reviews[\s\S]+ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid\(\)/);
  assert.match(sql, /ALTER TABLE consents[\s\S]+ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid\(\)/);
  assert.match(sql, /ALTER TABLE audit_log[\s\S]+ADD COLUMN created_at timestamptz NOT NULL DEFAULT now\(\)/);
});

test("migration de fórum adiciona regras sem alterar dados existentes", async () => {
  const sql = await fs.readFile(
    new URL("../../db/migrations/003_class_forum_rules.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /ALTER TABLE classes/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS rules text NOT NULL DEFAULT ''/);
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
  assert.deepEqual([...appliedNames], [
    "001_init.sql",
    "002_complete_table_metadata.sql",
    "003_class_forum_rules.sql",
  ]);
});

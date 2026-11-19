import path from "node:path";
import { createPool } from "../src/server/db.js";
import { loadConfig } from "../src/server/config.js";
import { purgeExpiredAccounts } from "../src/server/modules/privacy/service.js";

const cutoff = process.env.RETENTION_CUTOFF;
if (!cutoff) {
  throw new Error("Defina RETENTION_CUTOFF após validar a política de retenção");
}
if (process.env.CONFIRM_RETENTION_CLEANUP !== "true") {
  throw new Error("Defina CONFIRM_RETENTION_CLEANUP=true para confirmar a eliminação");
}

const config = loadConfig();
const pool = createPool(config.databaseUrl);
try {
  const result = await purgeExpiredAccounts(pool, {
    cutoff,
    uploadRoot: path.resolve("uploads"),
    staticRoot: path.resolve("public"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}

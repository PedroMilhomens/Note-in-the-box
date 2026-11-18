export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const host = env.HOST ?? "127.0.0.1";
  const portText = env.PORT ?? "3000";
  const port = Number(portText);
  const databaseUrl = env.DATABASE_URL || null;
  const databaseUrlTest = env.DATABASE_URL_TEST || null;

  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV inválido");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT inválido");
  }

  return { nodeEnv, host, port, databaseUrl, databaseUrlTest };
}

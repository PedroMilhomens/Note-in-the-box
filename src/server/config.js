export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const host = env.HOST ?? "127.0.0.1";
  const portText = env.PORT ?? "3000";
  const port = Number(portText);
  const databaseUrl = env.DATABASE_URL || null;
  const databaseUrlTest = env.DATABASE_URL_TEST || null;
  const appOrigin = env.APP_ORIGIN?.trim() || null;
  const termsVersion = env.TERMS_VERSION ?? "terms-v1";
  const privacyVersion = env.PRIVACY_VERSION ?? "privacy-v1";
  const legalDocumentsApproved = env.LEGAL_DOCUMENTS_APPROVED === "true";

  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV inválido");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT inválido");
  }

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(termsVersion)) {
    throw new Error("TERMS_VERSION inválida");
  }

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(privacyVersion)) {
    throw new Error("PRIVACY_VERSION inválida");
  }

  const legalApproval = env.LEGAL_DOCUMENTS_APPROVED ?? "false";
  if (!["true", "false"].includes(legalApproval)) {
    throw new Error("LEGAL_DOCUMENTS_APPROVED inválida");
  }

  let normalizedAppOrigin = null;
  if (appOrigin) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(appOrigin);
    } catch {
      throw new Error("APP_ORIGIN inválida");
    }

    if (
      !["http:", "https:"].includes(parsedOrigin.protocol)
      || parsedOrigin.origin !== appOrigin.replace(/\/$/, "")
      || parsedOrigin.username
      || parsedOrigin.password
    ) {
      throw new Error("APP_ORIGIN deve conter somente uma origem HTTP(S)");
    }
    normalizedAppOrigin = parsedOrigin.origin;
  }

  if (
    nodeEnv === "production"
    && (!normalizedAppOrigin || !normalizedAppOrigin.startsWith("https://"))
  ) {
    throw new Error("APP_ORIGIN HTTPS é obrigatória em produção");
  }

  return {
    nodeEnv,
    host,
    port,
    databaseUrl,
    databaseUrlTest,
    appOrigin: normalizedAppOrigin,
    termsVersion,
    privacyVersion,
    legalDocumentsApproved,
  };
}

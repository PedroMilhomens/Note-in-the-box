import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { Router } from "./router.js";
import { readJson } from "./http/body.js";
import { HttpError } from "./http/errors.js";
import { json } from "./http/json.js";
import { serveStatic } from "./http/static.js";
import {
  assertSameOrigin,
  isStateChangingMethod,
} from "./middleware/csrf.js";
import { createPool } from "./db.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerClassRoutes } from "./modules/classes/routes.js";

const config = loadConfig();

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "DENY",
  "cache-control": "no-store",
};

function createDefaultRouter() {
  const router = new Router();
  router.add("GET", "/api/saude", (_request, response) => {
    json(response, 200, { status: "ok" });
  });
  return router;
}

function defaultLogger(entry) {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function sendNotFound(response) {
  json(response, 404, {
    erro: "não encontrado",
    codigo: "NAO_ENCONTRADO",
  });
}

function sendError(response, error) {
  const safeError = error instanceof HttpError
    ? error
    : new HttpError(500, "ERRO_INTERNO", "erro interno");

  json(response, safeError.status, {
    erro: safeError.message,
    codigo: safeError.code,
  });
}

function applySecurityHeaders(response, nodeEnv) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }

  if (nodeEnv === "production") {
    response.setHeader(
      "strict-transport-security",
      "max-age=63072000",
    );
  }
}

function requestPath(request) {
  const rawUrl = request.url ?? "/";
  return rawUrl.split("?", 1)[0];
}

async function dispatch(request, response, {
  router,
  staticRoot,
  nodeEnv,
  bodyTimeoutMs,
  setRoute,
  appOrigin,
  legalDocumentsApproved,
}) {
  applySecurityHeaders(response, nodeEnv);

  const rawPath = requestPath(request);
  const isApiRequest = rawPath === "/api" || rawPath.startsWith("/api/");

  if (isApiRequest) {
    const match = router.match(request.method ?? "GET", request.url ?? "/");
    if (!match) {
      sendNotFound(response);
      return "unmatched";
    }

    setRoute(match.route);
    if (isStateChangingMethod(request.method)) {
      try {
        assertSameOrigin(request, appOrigin);
      } catch (error) {
        request.resume();
        throw error;
      }
    }
    if (
      match.route === "POST /api/auth/register"
      && !legalDocumentsApproved
    ) {
      request.resume();
      throw new HttpError(
        503,
        "DOCUMENTOS_PENDENTES",
        "cadastro indisponível até a validação humana dos documentos",
      );
    }
    await match.handler(request, response, match.params, {
      readJson: (options) => readJson(request, {
        timeoutMs: bodyTimeoutMs,
        ...options,
      }),
    });

    if (!response.writableEnded) {
      throw new Error("O handler da rota não encerrou a resposta");
    }
    return match.route;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    setRoute("static");
    const served = await serveStatic(request, response, staticRoot);
    if (served) return "static";
  }

  sendNotFound(response);
  return "unmatched";
}

export function createServer({
  router = createDefaultRouter(),
  staticRoot = path.resolve("public"),
  nodeEnv = process.env.NODE_ENV ?? "development",
  logger = defaultLogger,
  bodyTimeoutMs = 10_000,
  pool = null,
  appOrigin = config.appOrigin,
  termsVersion = config.termsVersion,
  privacyVersion = config.privacyVersion,
  legalDocumentsApproved = config.legalDocumentsApproved,
  rateLimiter,
} = {}) {
  if (pool) {
    registerAuthRoutes(router, {
      pool,
      nodeEnv,
      termsVersion,
      privacyVersion,
      rateLimiter,
    });
    registerClassRoutes(router, { pool, rateLimiter });
  }

  const server = http.createServer({
    headersTimeout: 10_000,
    requestTimeout: 30_000,
    maxHeaderSize: 16 * 1024,
  }, (request, response) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    let route = "unmatched";

    const finish = (status) => {
      logger({
        requestId,
        method: request.method ?? "UNKNOWN",
        route,
        status,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
    };

    void dispatch(request, response, {
      router,
      staticRoot,
      nodeEnv,
      bodyTimeoutMs,
      appOrigin,
      legalDocumentsApproved,
      setRoute: (matchedRoute) => {
        route = matchedRoute;
      },
    }).then((matchedRoute) => {
      route = matchedRoute;
      finish(response.statusCode);
    }).catch((error) => {
      if (!request.complete) request.resume();
      if (response.headersSent) {
        response.destroy();
      } else {
        try {
          applySecurityHeaders(response, nodeEnv);
          sendError(response, error);
        } catch (responseError) {
          response.destroy(responseError);
        }
      }

      finish(response.statusCode >= 400 ? response.statusCode : 500);
    });
  });

  server.on("clientError", (error, socket) => {
    if (!socket.writable) return;

    const status = error.code === "ERR_HTTP_REQUEST_TIMEOUT"
      || error.code === "HPE_HEADER_TIMEOUT"
      ? 408
      : 400;
    const reason = status === 408 ? "Request Timeout" : "Bad Request";
    const headers = { ...SECURITY_HEADERS };
    if (nodeEnv === "production") {
      headers["strict-transport-security"] = "max-age=63072000";
    }

    const serializedHeaders = Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\r\n");
    socket.end(
      `HTTP/1.1 ${status} ${reason}\r\n${serializedHeaders}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n`,
    );
    logger({
      requestId: randomUUID(),
      method: "UNKNOWN",
      route: "client-error",
      status,
      durationMs: 0,
    });
  });

  return server;
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const pool = createPool(config.databaseUrl);
  const server = createServer({
    nodeEnv: config.nodeEnv,
    appOrigin: config.appOrigin,
    pool,
    termsVersion: config.termsVersion,
    privacyVersion: config.privacyVersion,
    legalDocumentsApproved: config.legalDocumentsApproved,
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(`Servidor iniciado em http://${config.host}:${config.port}\n`);
  });
}

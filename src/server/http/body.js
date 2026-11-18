import { HttpError } from "./errors.js";

const DEFAULT_BODY_LIMIT = 1024 * 1024;
const DEFAULT_BODY_TIMEOUT_MS = 10_000;

export function readBody(
  request,
  { limit = DEFAULT_BODY_LIMIT, timeoutMs = DEFAULT_BODY_TIMEOUT_MS } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError("Limite de corpo inválido");
  }

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("Timeout de corpo inválido");
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => {
      fail(new HttpError(408, "TEMPO_ESGOTADO", "tempo de requisição esgotado"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      request.resume();
      reject(error);
    }

    function onData(chunk) {
      size += chunk.length;
      if (size > limit) {
        fail(new HttpError(
          413,
          "CORPO_MUITO_GRANDE",
          "corpo da requisição muito grande",
        ));
        return;
      }

      chunks.push(chunk);
    }

    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    }

    function onAborted() {
      fail(new HttpError(400, "REQUISICAO_ABORTADA", "requisição incompleta"));
    }

    function onError() {
      fail(new HttpError(400, "REQUISICAO_INVALIDA", "requisição inválida"));
    }

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", onAborted);
    request.once("error", onError);
  });
}

export async function readJson(request, options) {
  const contentType = request.headers["content-type"]
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new HttpError(
      415,
      "TIPO_DE_CONTEUDO_INVALIDO",
      "o conteúdo deve ser JSON",
    );
  }

  const body = await readBody(request, options);
  if (body.length === 0) {
    throw new HttpError(400, "JSON_INVALIDO", "JSON inválido");
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON_INVALIDO", "JSON inválido");
  }
}

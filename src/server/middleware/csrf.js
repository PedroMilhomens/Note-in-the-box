import { HttpError } from "../http/errors.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isStateChangingMethod(method) {
  return typeof method === "string"
    && STATE_CHANGING_METHODS.has(method.toUpperCase());
}

function originOf(value) {
  if (typeof value !== "string" || value === "null") return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(request, configuredOrigin = null) {
  let expectedOrigin = originOf(configuredOrigin);
  if (!expectedOrigin && !configuredOrigin) {
    const host = request.headers.host;
    const protocol = request.socket.encrypted ? "https:" : "http:";
    if (typeof host === "string") {
      expectedOrigin = originOf(`${protocol}//${host}`);
    }
  }

  const suppliedOrigin = request.headers.origin ?? request.headers.referer;
  const actualOrigin = originOf(suppliedOrigin);
  if (!expectedOrigin || !actualOrigin || actualOrigin !== expectedOrigin) {
    throw new HttpError(403, "ORIGEM_INVALIDA", "origem da requisição não permitida");
  }
}

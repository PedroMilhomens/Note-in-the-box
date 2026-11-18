import { HttpError } from "./http/errors.js";

function decodePath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
  }

  const rawPath = path.split("?", 1)[0];
  return rawPath.split("/").slice(1).map((part) => {
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
    }

    if (
      decoded.includes("/")
      || decoded.includes("\\")
      || decoded.includes("\0")
      || decoded === "."
      || decoded === ".."
    ) {
      throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
    }

    return decoded;
  });
}

function parsePattern(pattern) {
  if (typeof pattern !== "string" || !pattern.startsWith("/")) {
    throw new TypeError("A rota deve começar com /");
  }

  const parts = pattern.split("/").slice(1);
  const parameterNames = new Set();
  for (const part of parts) {
    if (part.startsWith(":")) {
      const name = part.slice(1);
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || parameterNames.has(name)) {
        throw new TypeError("Parâmetro de rota inválido");
      }
      parameterNames.add(name);
    } else if (part.includes(":")) {
      throw new TypeError("Segmento de rota inválido");
    }
  }

  return parts;
}

export class Router {
  #routes = [];

  add(method, pattern, handler) {
    const normalizedMethod = method.toUpperCase();
    const segments = parsePattern(pattern);

    if (!/^[A-Z]+$/.test(normalizedMethod)) {
      throw new TypeError("Método HTTP inválido");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Handler da rota deve ser uma função");
    }

    if (this.has(normalizedMethod, pattern)) {
      throw new TypeError("Rota duplicada");
    }

    this.#routes.push({
      method: normalizedMethod,
      pattern,
      segments,
      handler,
      route: `${normalizedMethod} ${pattern}`,
    });
  }

  has(method, pattern) {
    const normalizedMethod = method.toUpperCase();
    return this.#routes.some(
      (route) => route.method === normalizedMethod && route.pattern === pattern,
    );
  }

  match(method, path) {
    const requestSegments = decodePath(path);
    const normalizedMethod = method.toUpperCase();

    for (const route of this.#routes) {
      if (
        route.method !== normalizedMethod
        || route.segments.length !== requestSegments.length
      ) {
        continue;
      }

      const params = {};
      let matches = true;

      for (let index = 0; index < route.segments.length; index += 1) {
        const patternSegment = route.segments[index];
        const requestSegment = requestSegments[index];

        if (patternSegment.startsWith(":")) {
          params[patternSegment.slice(1)] = requestSegment;
        } else if (patternSegment !== requestSegment) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return { handler: route.handler, route: route.route, params };
      }
    }

    return null;
  }
}

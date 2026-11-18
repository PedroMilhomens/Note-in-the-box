import fs from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors.js";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
]);

function isWithin(directory, file) {
  return file === directory || file.startsWith(`${directory}${path.sep}`);
}

function pathFromRequest(requestUrl) {
  const encodedPath = requestUrl.split("?", 1)[0];
  if (!encodedPath.startsWith("/")) {
    throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
  }

  const rawSegments = encodedPath === "/"
    ? []
    : encodedPath.split("/").slice(1);
  const segments = rawSegments.map((segment) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
    }

    if (
      decoded.includes("/")
      || decoded.includes("\\")
      || decoded.includes("\0")
    ) {
      throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
    }

    return decoded;
  });

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new HttpError(400, "CAMINHO_INVALIDO", "caminho inválido");
  }

  if (segments.some((segment) => segment.startsWith("."))) {
    return null;
  }

  if (segments.length === 0 || segments.at(-1) === "") {
    segments.push("index.html");
  }

  return segments.join(path.sep);
}

async function findFile(root, relativePath) {
  let candidate = path.resolve(root, relativePath);
  if (!isWithin(root, candidate)) return null;

  let details;
  try {
    details = await fs.stat(candidate);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }

  if (details.isDirectory()) {
    candidate = path.join(candidate, "index.html");
    try {
      details = await fs.stat(candidate);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    }
  }

  if (!details.isFile()) return null;

  const [realRoot, realFile] = await Promise.all([
    fs.realpath(root),
    fs.realpath(candidate),
  ]);
  if (!isWithin(realRoot, realFile)) return null;
  return { file: realFile, details };
}

export async function serveStatic(request, response, staticRoot) {
  const relativePath = pathFromRequest(request.url ?? "/");
  if (relativePath === null) return false;

  let root;
  try {
    root = await fs.realpath(staticRoot);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }

  const result = await findFile(root, relativePath);
  if (!result) return false;

  const body = await fs.readFile(result.file);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES.get(path.extname(result.file).toLowerCase())
      ?? "application/octet-stream",
    "content-length": result.details.size,
    "cache-control": "no-store",
  });
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}

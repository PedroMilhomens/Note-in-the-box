import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  resolvePrivateUploadRoot,
  validateAttachment,
} from "../../src/server/modules/notes/collaboration-service.js";

test("upload só aceita tipo permitido com assinatura correspondente", () => {
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(
    validateAttachment({ bytes: pngHeader, mimeType: "image/png" }).extension,
    "png",
  );
  assert.throws(
    () => validateAttachment({
      bytes: Buffer.from("<script>alert(1)</script>"),
      mimeType: "image/png",
    }),
    { status: 415, code: "TIPO_DE_ARQUIVO_INVALIDO" },
  );
  assert.throws(
    () => validateAttachment({
      bytes: Buffer.from("%PDF-1.7"),
      mimeType: "text/html",
    }),
    { status: 415, code: "TIPO_DE_ARQUIVO_INVALIDO" },
  );
  assert.equal(
    validateAttachment({
      bytes: Buffer.from("%PDF-1.7"),
      mimeType: "application/pdf",
    }).extension,
    "pdf",
  );
  assert.equal(
    validateAttachment({
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
    }).extension,
    "jpg",
  );
  const webpHeader = Buffer.alloc(12);
  webpHeader.write("RIFF", 0, "ascii");
  webpHeader.write("WEBP", 8, "ascii");
  assert.equal(
    validateAttachment({ bytes: webpHeader, mimeType: "image/webp" }).extension,
    "webp",
  );
  assert.throws(
    () => validateAttachment({ bytes: Buffer.alloc(0), mimeType: "image/png" }),
    { status: 413, code: "ARQUIVO_INVALIDO" },
  );
});

test("upload storage rejects a symlink into the static directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "note-storage-"));
  const staticRoot = path.join(root, "public");
  const uploadLink = path.join(root, "uploads");
  await fs.mkdir(staticRoot);
  await fs.symlink(staticRoot, uploadLink, "dir");
  try {
    await assert.rejects(
      resolvePrivateUploadRoot(uploadLink, staticRoot),
      /fora da pasta estática/u,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

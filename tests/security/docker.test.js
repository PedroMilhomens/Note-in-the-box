import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const dockerfilePath = path.resolve("Dockerfile");
const dockerignorePath = path.resolve(".dockerignore");

test("Dockerfile exists", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.length > 0);
});

test("Dockerfile uses multi-stage build", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.includes("FROM node:22-alpine AS builder"));
  assert.ok(content.includes("FROM node:22-alpine AS runtime"));
});

test("Dockerfile installs only production dependencies", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.includes("npm ci --omit=dev"));
});

test("Dockerfile runs as non-root user (nodejs)", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.includes("USER nodejs"));
  // Verify user creation
  assert.ok(content.includes("adduser -u 1000 -S nodejs -G nodejs"));
});

test("Dockerfile does not copy .env files", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  // COPY . . would copy everything, but .dockerignore should exclude .env*
  // The test verifies .dockerignore handles it, but also check no explicit COPY of .env
  assert.ok(!content.includes("COPY .env"));
  assert.ok(!content.includes("COPY --chown=nodejs:nodejs .env"));
});

test("Dockerfile has HEALTHCHECK on /api/saude", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.includes("HEALTHCHECK"));
  assert.ok(content.includes("/api/saude"));
});

test("Dockerfile uses dumb-init for signal handling", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.includes("dumb-init"));
  assert.ok(content.includes("ENTRYPOINT"));
});

test("Dockerfile creates uploads directory outside public", async () => {
  const content = await readFile(dockerfilePath, "utf8");
  assert.ok(content.includes("mkdir -p /app/uploads"));
  assert.ok(content.includes("chown nodejs:nodejs /app/uploads"));
});

test(".dockerignore exists", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  assert.ok(content.length > 0);
});

test(".dockerignore excludes node_modules", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  assert.ok(content.includes("node_modules"));
});

test(".dockerignore excludes .env files", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  // Should exclude all .env* but allow .env.docker.example
  assert.ok(content.includes(".env"));
  assert.ok(content.includes(".env.*"));
  assert.ok(content.includes("!.env.docker.example"));
});

test(".dockerignore excludes tests directory", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  assert.ok(content.includes("tests"));
});

test(".dockerignore excludes preview_pictures and assets-src", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  assert.ok(content.includes("preview_pictures"));
  assert.ok(content.includes("assets-src"));
});

test(".dockerignore excludes AGENTS-MUST-README", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  assert.ok(content.includes("AGENTS-MUST-README"));
});

test(".dockerignore excludes git and IDE files", async () => {
  const content = await readFile(dockerignorePath, "utf8");
  assert.ok(content.includes(".git"));
  assert.ok(content.includes(".vscode"));
  assert.ok(content.includes(".idea"));
});
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SIMPLE_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "iloveyou",
  "letmein",
  "letmein123",
  "password",
  "password123",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "senha123",
  "admin1234",
]);

async function derive(password, salt) {
  return scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
}

export function isStrongPassword(password) {
  if (
    typeof password !== "string"
    || password.length < 8
    || password.length > 128
    || Buffer.byteLength(password, "utf8") > 256
  ) {
    return false;
  }

  const normalized = password.toLowerCase();
  return !SIMPLE_PASSWORDS.has(normalized)
    && !/^(.)\1+$/u.test(password);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return [
    "scrypt",
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function parsePasswordHash(encodedHash) {
  if (typeof encodedHash !== "string") return null;

  const parts = encodedHash.split("$");
  if (
    parts.length !== 6
    || parts[0] !== "scrypt"
    || parts[1] !== String(SCRYPT_OPTIONS.N)
    || parts[2] !== String(SCRYPT_OPTIONS.r)
    || parts[3] !== String(SCRYPT_OPTIONS.p)
    || !/^[A-Za-z0-9_-]{22}$/.test(parts[4])
    || !/^[A-Za-z0-9_-]{86}$/.test(parts[5])
  ) {
    return null;
  }

  const salt = Buffer.from(parts[4], "base64url");
  const key = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || key.length !== KEY_LENGTH) return null;
  return { salt, key };
}

const dummyPasswordHash = await hashPassword(
  randomBytes(32).toString("base64url"),
);

export async function verifyPassword(password, encodedHash) {
  const parsedHash = parsePasswordHash(encodedHash);
  const salt = parsedHash?.salt ?? Buffer.alloc(16, 0x5a);
  const expectedKey = parsedHash?.key ?? Buffer.alloc(KEY_LENGTH);
  const safePassword = typeof password === "string" ? password : "";
  const actualKey = await derive(safePassword, salt);
  const matches = timingSafeEqual(actualKey, expectedKey);
  return Boolean(parsedHash && matches);
}

export function getDummyPasswordHash() {
  return dummyPasswordHash;
}

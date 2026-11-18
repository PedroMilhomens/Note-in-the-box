import { HttpError } from "../http/errors.js";

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const MAXIMUM_KEYS = 10_000;

export class RateLimiter {
  #entries = new Map();

  constructor({
    limit = DEFAULT_LIMIT,
    windowMs = DEFAULT_WINDOW_MS,
    maximumKeys = MAXIMUM_KEYS,
  } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new TypeError("Limite de tentativas inválido");
    }
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new TypeError("Janela de rate limit inválida");
    }
    if (!Number.isSafeInteger(maximumKeys) || maximumKeys < 1) {
      throw new TypeError("Limite de chaves de rate limit inválido");
    }

    this.limit = limit;
    this.windowMs = windowMs;
    this.maximumKeys = maximumKeys;
  }

  consume(ipAddress, accountKey, now = Date.now()) {
    this.#removeExpired(now);
    const keys = [`ip:${ipAddress}`];
    if (accountKey) keys.push(`account:${accountKey}`);

    for (const key of keys) {
      const entry = this.#entries.get(key);
      if (entry && entry.count >= this.limit) {
        throw new HttpError(
          429,
          "MUITAS_TENTATIVAS",
          "muitas tentativas; tente novamente mais tarde",
        );
      }
    }

    const newKeys = keys.filter((key) => !this.#entries.has(key));
    if (this.#entries.size + newKeys.length > this.maximumKeys) {
      throw new HttpError(
        429,
        "MUITAS_TENTATIVAS",
        "muitas tentativas; tente novamente mais tarde",
      );
    }

    for (const key of keys) {
      const entry = this.#entries.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        this.#entries.set(key, {
          count: 1,
          expiresAt: now + this.windowMs,
        });
      }
    }
  }

  #removeExpired(now) {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(key);
    }
  }
}

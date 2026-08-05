'use strict';

/**
 * Simple in-memory sliding window rate limiter (single process).
 */
function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  function prune(key, now) {
    const arr = hits.get(key) || [];
    const next = arr.filter((t) => now - t < windowMs);
    if (next.length) hits.set(key, next);
    else hits.delete(key);
    return next;
  }

  function check(key) {
    const now = Date.now();
    const arr = prune(key, now);
    if (arr.length >= max) {
      return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - arr[0]) };
    }
    arr.push(now);
    hits.set(key, arr);
    return { ok: true, remaining: max - arr.length };
  }

  return { check };
}

module.exports = { createRateLimiter };

'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./db');
const { resolveSiteDir } = require('./safePath');
const { normalizeUsername } = require('./db');

function removeSiteFiles(username, id) {
  const dir = resolveSiteDir(username, id);
  if (!dir) {
    console.error('[PageDrop] refuse unsafe site path', username, id);
    return false;
  }
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // prune empty user dir
  const user = normalizeUsername(username);
  const userDir = path.join(config.sitesDir, user);
  try {
    const resolvedUser = path.resolve(userDir);
    const root = path.resolve(config.sitesDir);
    if (
      resolvedUser.startsWith(root + path.sep) &&
      fs.existsSync(resolvedUser) &&
      fs.readdirSync(resolvedUser).length === 0
    ) {
      fs.rmdirSync(resolvedUser);
    }
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Delete a page record and its files. Returns removed record or null.
 * Files first, then metadata — avoids orphaned DB rows if disk delete fails.
 */
function deletePage(username, id) {
  const existing = db.getPage(username, id, { includeExpired: true });
  const filesOk = removeSiteFiles(username, id);
  if (!filesOk && existing) {
    throw Object.assign(new Error('不安全的页面路径，已拒绝删除'), { status: 400 });
  }
  const removed = db.removePage(username, id);
  return removed || existing || null;
}

/**
 * Purge all expired pages. Returns count deleted.
 */
function purgeExpired() {
  const expired = db.listExpired();
  let n = 0;
  for (const page of expired) {
    try {
      deletePage(page.username, page.id);
      n += 1;
    } catch (err) {
      console.error('[PageDrop] cleanup failed', page.username, page.id, err.message);
    }
  }
  return n;
}

function startCleanupScheduler() {
  // run once on start
  try {
    const n = purgeExpired();
    if (n > 0) console.log(`[PageDrop] purged ${n} expired page(s) on startup`);
  } catch (err) {
    console.error('[PageDrop] startup cleanup error', err);
  }

  const ms = config.cleanupIntervalMs;
  if (!ms || ms < 5000) return null;

  const timer = setInterval(() => {
    try {
      const n = purgeExpired();
      if (n > 0) console.log(`[PageDrop] purged ${n} expired page(s)`);
    } catch (err) {
      console.error('[PageDrop] cleanup error', err);
    }
  }, ms);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  deletePage,
  purgeExpired,
  removeSiteFiles,
  startCleanupScheduler,
};

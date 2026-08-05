'use strict';

const path = require('path');
const config = require('../config');
const { normalizeUsername, isValidUsername } = require('./db');

/** Site id alphabet from nanoid custom alphabet + legacy safety */
const ID_RE = /^[a-z0-9_-]{1,32}$/i;

function isValidSiteId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/**
 * Resolve site directory under sitesDir, or null if unsafe/invalid.
 */
function resolveSiteDir(username, id) {
  if (!isValidUsername(username) || !isValidSiteId(id)) return null;
  const user = normalizeUsername(username);
  const root = path.resolve(config.sitesDir);
  const dir = path.resolve(root, user, id);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (dir !== root && !dir.startsWith(prefix)) return null;
  // must be exactly root/user/id
  const rel = path.relative(root, dir);
  const parts = rel.split(path.sep);
  if (parts.length !== 2 || parts[0] !== user || parts[1] !== id) return null;
  return dir;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  isValidSiteId,
  resolveSiteDir,
  escapeHtml,
};

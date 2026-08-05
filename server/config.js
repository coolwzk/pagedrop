'use strict';

const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function envBool(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(v).toLowerCase());
}

function envInt(name, defaultValue) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : defaultValue;
}

const authEnabled = envBool('AUTH_ENABLED', true);

// Stable secret within one process if not provided (dev only)
let sessionSecret = process.env.SESSION_SECRET || '';
if (!sessionSecret) {
  sessionSecret = authEnabled
    ? crypto.randomBytes(32).toString('hex')
    : 'dev-insecure-session-secret';
  if (authEnabled && process.env.NODE_ENV === 'production') {
    console.warn(
      '[PageDrop] WARNING: SESSION_SECRET not set; using ephemeral secret (sessions reset on restart). Set SESSION_SECRET in production.'
    );
  }
}

module.exports = {
  port: envInt('PORT', 3780),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: (process.env.PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, ''),
  rootDir: ROOT,
  sitesDir: path.join(ROOT, 'storage', 'sites'),
  dataDir: path.join(ROOT, 'data'),
  pagesDbPath: path.join(ROOT, 'data', 'pages.json'),
  usersDbPath: path.join(ROOT, 'data', 'users.json'),
  maxFileBytes: envInt('MAX_FILE_BYTES', 20 * 1024 * 1024),
  maxZipEntries: 500,
  maxZipUncompressedBytes: 80 * 1024 * 1024,
  allowedExtensions: new Set([
    '.html', '.htm', '.css', '.js', '.mjs', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.txt', '.md', '.map', '.xml', '.pdf', '.mp4', '.webm', '.mp3',
  ]),

  // Auth
  authEnabled,
  authAllowRegister: envBool('AUTH_ALLOW_REGISTER', false),
  sessionSecret,
  sessionTtlSeconds: envInt('SESSION_TTL_SECONDS', 60 * 60 * 24 * 7), // 7d
  cookieName: 'pd_session',
  cookieSecure: envBool('COOKIE_SECURE', false),
  adminUsername: (process.env.ADMIN_USERNAME || 'admin').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  // TTL / cleanup
  // DEFAULT_TTL_DAYS: 0 = never expire by default; e.g. 30 = 30 days
  defaultTtlDays: envInt('DEFAULT_TTL_DAYS', 30),
  allowedTtlDays: [0, 1, 7, 30, 90, 365],
  cleanupIntervalMs: envInt('CLEANUP_INTERVAL_MS', 15 * 60 * 1000),

  // Login rate limit
  loginMaxAttempts: envInt('LOGIN_MAX_ATTEMPTS', 10),
  loginWindowMs: envInt('LOGIN_WINDOW_MS', 15 * 60 * 1000),
};

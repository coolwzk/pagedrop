'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pagedrop-auth-'));

process.env.AUTH_ENABLED = 'true';
process.env.SESSION_SECRET = 'test-secret-for-auth-suite-32chars!!';
process.env.ADMIN_PASSWORD = 'adminpass';
process.env.ADMIN_USERNAME = 'admin';

// Isolate stores before requiring modules
const config = require('../server/config');
config.authEnabled = true;
config.sessionSecret = process.env.SESSION_SECRET;
config.adminPassword = 'adminpass';
config.adminUsername = 'admin';
config.defaultAdminPassword = 'admin123';
config.dataDir = path.join(tmpRoot, 'data');
config.sitesDir = path.join(tmpRoot, 'sites');
config.pagesDbPath = path.join(tmpRoot, 'data', 'pages.json');
config.usersDbPath = path.join(tmpRoot, 'data', 'users.json');

const {
  createSessionToken,
  verifySessionToken,
  readSession,
} = require('../server/lib/session');
const {
  createUser,
  findUser,
  verifyPassword,
  bootstrapAdmin,
  publicUser,
  changePassword,
  resetAdminPassword,
} = require('../server/lib/users');
const { canManagePage } = require('../server/middleware/auth');
const { computeExpiresAt, resolveTtlDays } = require('../server/lib/publish');
const { deletePage, purgeExpired } = require('../server/lib/cleanup');
const db = require('../server/lib/db');
const { publish } = require('../server/lib/publish');

db.ensureDirs();

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('auth + ttl + delete');

test('bootstrap admin from ADMIN_PASSWORD', () => {
  bootstrapAdmin();
  const admin = findUser('admin');
  assert.ok(admin);
  assert.strictEqual(admin.role, 'admin');
  assert.ok(verifyPassword(admin, 'adminpass'));
  assert.strictEqual(admin.mustChangePassword, false);
});

test('session roundtrip', () => {
  const user = findUser('admin');
  const token = createSessionToken(user);
  const payload = verifySessionToken(token);
  assert.strictEqual(payload.username, 'admin');
  assert.strictEqual(payload.role, 'admin');
});

test('session rejects tampering', () => {
  const user = findUser('admin');
  const token = createSessionToken(user);
  const bad = token.slice(0, -4) + 'xxxx';
  assert.strictEqual(verifySessionToken(bad), null);
});

test('create user and password verify', () => {
  createUser({ username: 'alice', password: 'secret1', role: 'user' });
  const u = findUser('alice');
  assert.ok(verifyPassword(u, 'secret1'));
  assert.ok(!verifyPassword(u, 'wrong'));
});

test('canManagePage owner and admin', () => {
  const page = { username: 'alice', owner: 'alice', id: 'x' };
  assert.ok(canManagePage({ username: 'alice', role: 'user' }, page));
  assert.ok(!canManagePage({ username: 'bob', role: 'user' }, page));
  assert.ok(canManagePage({ username: 'admin', role: 'admin' }, page));
});

test('ttl compute', () => {
  config.allowedTtlDays = [0, 1, 7, 30, 90, 365];
  assert.strictEqual(resolveTtlDays(0), 0);
  assert.strictEqual(resolveTtlDays(7), 7);
  assert.strictEqual(computeExpiresAt(0), null);
  const exp = computeExpiresAt(1, new Date('2026-01-01T00:00:00.000Z'));
  assert.strictEqual(exp, '2026-01-02T00:00:00.000Z');
});

test('publish with ttl and delete', () => {
  const record = publish({
    username: 'alice',
    owner: 'alice',
    ttlDays: 7,
    file: {
      originalname: 't.html',
      mimetype: 'text/html',
      buffer: Buffer.from('<html><title>T</title></html>'),
      size: 30,
    },
  });
  assert.strictEqual(record.owner, 'alice');
  assert.ok(record.expiresAt);
  assert.ok(fs.existsSync(path.join(config.sitesDir, 'alice', record.id, 'index.html')));

  const removed = deletePage('alice', record.id);
  assert.ok(removed);
  assert.strictEqual(db.getPage('alice', record.id, { includeExpired: true }), null);
  assert.ok(!fs.existsSync(path.join(config.sitesDir, 'alice', record.id)));
});

test('purge expired', () => {
  const record = publish({
    username: 'alice',
    owner: 'alice',
    ttlDays: 1,
    file: {
      originalname: 'old.html',
      mimetype: 'text/html',
      buffer: Buffer.from('<html><title>Old</title></html>'),
    },
  });
  // force expire
  const pages = JSON.parse(fs.readFileSync(config.pagesDbPath, 'utf8'));
  const row = pages.find((p) => p.id === record.id);
  row.expiresAt = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(config.pagesDbPath, JSON.stringify(pages, null, 2));

  const n = purgeExpired();
  assert.ok(n >= 1);
  assert.strictEqual(db.getPage('alice', record.id, { includeExpired: true }), null);
});

test('readSession from cookie header', () => {
  const user = findUser('admin');
  const token = createSessionToken(user);
  const req = { headers: { cookie: `pd_session=${encodeURIComponent(token)}` } };
  const session = readSession(req);
  assert.strictEqual(session.username, 'admin');
});

test('change password', () => {
  changePassword('alice', 'secret1', 'secret2');
  const u = findUser('alice');
  assert.ok(verifyPassword(u, 'secret2'));
  assert.ok(!verifyPassword(u, 'secret1'));
});

test('reset admin writes credentials file', () => {
  fs.writeFileSync(config.usersDbPath, '[]', 'utf8');
  config.adminPassword = '';
  const result = resetAdminPassword(config.defaultAdminPassword);
  assert.strictEqual(result.username, 'admin');
  assert.strictEqual(result.password, 'admin123');
  assert.ok(fs.existsSync(path.join(config.dataDir, 'INITIAL_CREDENTIALS.txt')));
});

// silence unused
void crypto;
void publicUser;

fs.rmSync(tmpRoot, { recursive: true, force: true });

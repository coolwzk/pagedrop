'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pagedrop-http-'));

process.env.AUTH_ENABLED = 'true';
process.env.SESSION_SECRET = 'http-test-session-secret-32bytes!!';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpass';
process.env.PORT = '0';

const config = require('../server/config');
config.authEnabled = true;
config.sessionSecret = process.env.SESSION_SECRET;
config.adminUsername = 'admin';
config.adminPassword = 'adminpass';
config.dataDir = path.join(tmpRoot, 'data');
config.sitesDir = path.join(tmpRoot, 'sites');
config.pagesDbPath = path.join(tmpRoot, 'data', 'pages.json');
config.usersDbPath = path.join(tmpRoot, 'data', 'users.json');
config.cleanupIntervalMs = 0;

// fresh modules after path patch — config already mutated
const db = require('../server/lib/db');
db.ensureDirs();
const { bootstrapAdmin } = require('../server/lib/users');
bootstrapAdmin();

const app = require('../server/index');

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ✓ ${name}`))
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      throw err;
    });
}

function request(server, { method = 'GET', path: p, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const opts = {
      hostname: '127.0.0.1',
      port: addr.port,
      path: p,
      method,
      headers: { ...headers },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {
          /* text */
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw,
          json,
          setCookie: res.headers['set-cookie'] || [],
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function cookieFrom(setCookie) {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  console.log('http integration');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    await test('publish without auth → 401', async () => {
      const r = await request(server, { method: 'POST', path: '/api/publish' });
      assert.strictEqual(r.status, 401);
      assert.strictEqual(r.json.code, 'UNAUTHORIZED');
    });

    let cookie = '';
    await test('login success sets cookie', async () => {
      const body = JSON.stringify({ username: 'admin', password: 'adminpass' });
      const r = await request(server, {
        method: 'POST',
        path: '/api/auth/login',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        body,
      });
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.ok);
      cookie = cookieFrom(r.setCookie);
      assert.ok(cookie.includes('pd_session='));
    });

    let pagePath = '';
    let pageUser = '';
    let pageId = '';
    await test('publish with auth works and forces username', async () => {
      const boundary = '----pdtest';
      const fileBody = '<html><title>HttpT</title><body>ok</body></html>';
      const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="username"\r\n\r\nhacker\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="ttlDays"\r\n\r\n7\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.html"\r\nContent-Type: text/html\r\n\r\n${fileBody}\r\n`,
        `--${boundary}--\r\n`,
      ].join('');
      const r = await request(server, {
        method: 'POST',
        path: '/api/publish',
        headers: {
          Cookie: cookie,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(parts),
        },
        body: parts,
      });
      assert.strictEqual(r.status, 200, r.raw);
      assert.strictEqual(r.json.page.username, 'admin');
      assert.strictEqual(r.json.page.owner, 'admin');
      pagePath = r.json.path;
      pageUser = r.json.page.username;
      pageId = r.json.page.id;
    });

    await test('public page is readable without cookie', async () => {
      const r = await request(server, { path: pagePath });
      assert.strictEqual(r.status, 200);
      assert.ok(r.raw.includes('HttpT'));
    });

    await test('XSS path params are escaped in 404 html', async () => {
      const r = await request(server, { path: '/p/%3Cscript%3Ealert(1)%3C%2Fscript%3E/x/' });
      assert.ok(r.status === 404 || r.status === 400);
      assert.ok(!r.raw.includes('<script>alert(1)</script>'));
      assert.ok(r.raw.includes('&lt;script&gt;') || r.raw.includes('不存在'));
    });

    await test('expired page returns 410', async () => {
      const pages = JSON.parse(fs.readFileSync(config.pagesDbPath, 'utf8'));
      const row = pages.find((p) => p.id === pageId);
      row.expiresAt = new Date(Date.now() - 1000).toISOString();
      fs.writeFileSync(config.pagesDbPath, JSON.stringify(pages, null, 2));
      const r = await request(server, { path: `/p/${pageUser}/${pageId}/` });
      assert.strictEqual(r.status, 410);
    });

    await test('delete requires auth', async () => {
      // re-publish a fresh page for delete tests
      const boundary = '----pdtest2';
      const fileBody = '<html><title>Del</title></html>';
      const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="ttlDays"\r\n\r\n0\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="d.html"\r\nContent-Type: text/html\r\n\r\n${fileBody}\r\n`,
        `--${boundary}--\r\n`,
      ].join('');
      const pub = await request(server, {
        method: 'POST',
        path: '/api/publish',
        headers: {
          Cookie: cookie,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(parts),
        },
        body: parts,
      });
      assert.strictEqual(pub.status, 200, pub.raw);
      const id = pub.json.page.id;
      const unauth = await request(server, {
        method: 'DELETE',
        path: `/api/pages/admin/${id}`,
      });
      assert.strictEqual(unauth.status, 401);

      const ok = await request(server, {
        method: 'DELETE',
        path: `/api/pages/admin/${id}`,
        headers: { Cookie: cookie },
      });
      assert.strictEqual(ok.status, 200);
      assert.ok(ok.json.ok);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

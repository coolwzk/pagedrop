'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

// Isolate storage for tests
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pagedrop-pub-'));
process.env.PORT = '0';

// Monkey-patch config paths before requiring modules
const config = require('../server/config');
config.sitesDir = path.join(tmpRoot, 'sites');
config.dataDir = path.join(tmpRoot, 'data');
config.pagesDbPath = path.join(tmpRoot, 'data', 'pages.json');

const db = require('../server/lib/db');
const { publish, publicPath } = require('../server/lib/publish');
const { extractTitle } = require('../server/lib/markdown');

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

console.log('publish pipeline');

test('publish html', () => {
  const record = publish({
    username: 'ZhangSan',
    file: {
      originalname: 'hello.html',
      mimetype: 'text/html',
      buffer: Buffer.from('<html><title>Hello World</title><body>hi</body></html>'),
      size: 50,
    },
  });
  assert.strictEqual(record.username, 'zhangsan');
  assert.strictEqual(record.kind, 'html');
  assert.strictEqual(record.title, 'Hello World');
  assert.ok(fs.existsSync(path.join(config.sitesDir, 'zhangsan', record.id, 'index.html')));
  assert.strictEqual(publicPath(record), `/p/zhangsan/${record.id}/`);
});

test('publish markdown', () => {
  const md = '# 会议纪要\n\n- item 1\n';
  const record = publish({
    username: 'lisi',
    file: {
      originalname: 'notes.md',
      mimetype: 'text/markdown',
      buffer: Buffer.from(md),
      size: md.length,
    },
  });
  assert.strictEqual(record.kind, 'md');
  assert.strictEqual(record.title, '会议纪要');
  const html = fs.readFileSync(
    path.join(config.sitesDir, 'lisi', record.id, 'index.html'),
    'utf8'
  );
  assert.ok(html.includes('<h1'));
  assert.ok(html.includes('会议纪要'));
});

test('publish zip site', () => {
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<html><title>Zip Site</title></html>'));
  zip.addFile('app.js', Buffer.from('console.log(1)'));
  const buf = zip.toBuffer();
  const record = publish({
    username: 'wangwu',
    file: {
      originalname: 'site.zip',
      mimetype: 'application/zip',
      buffer: buf,
      size: buf.length,
    },
  });
  assert.strictEqual(record.kind, 'zip');
  assert.strictEqual(record.title, 'Zip Site');
  assert.ok(record.fileCount >= 2);
});

test('reject bad username', () => {
  assert.throws(
    () =>
      publish({
        username: '!!!',
        file: {
          originalname: 'a.html',
          mimetype: 'text/html',
          buffer: Buffer.from('<html></html>'),
        },
      }),
    /用户名无效/
  );
});

test('list by username', () => {
  const pages = db.listByUsername('zhangsan');
  assert.ok(pages.length >= 1);
});

test('extractTitle', () => {
  assert.strictEqual(extractTitle('# Hello\n\nbody'), 'Hello');
});

// cleanup
fs.rmSync(tmpRoot, { recursive: true, force: true });

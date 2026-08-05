'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { extractZipSafe } = require('../server/lib/zip');

function tmpDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pagedrop-${name}-`));
  return dir;
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('zip safety');

test('extracts valid zip with index.html', () => {
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<html><title>Hi</title></html>'));
  zip.addFile('style.css', Buffer.from('body{}'));
  const dir = tmpDir('ok');
  const result = extractZipSafe(zip.toBuffer(), dir);
  assert.strictEqual(result.entryFile, 'index.html');
  assert.ok(fs.existsSync(path.join(dir, 'index.html')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hoists single nested folder', () => {
  const zip = new AdmZip();
  zip.addFile('mysite/index.html', Buffer.from('<html>nested</html>'));
  zip.addFile('mysite/a.css', Buffer.from('a{}'));
  const dir = tmpDir('hoist');
  const result = extractZipSafe(zip.toBuffer(), dir);
  assert.strictEqual(result.entryFile, 'index.html');
  assert.ok(fs.existsSync(path.join(dir, 'index.html')));
  assert.ok(!fs.existsSync(path.join(dir, 'mysite')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects zip slip traversal', () => {
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<html></html>'));
  // adm-zip sanitizes "../" in addFile names — force a malicious entryName
  const evil = zip.addFile('tmp.html', Buffer.from('x'));
  evil.entryName = '../../evil.html';
  const dir = tmpDir('slip');
  assert.throws(() => extractZipSafe(zip.toBuffer(), dir), /不安全|Zip Slip/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects missing index.html', () => {
  const zip = new AdmZip();
  zip.addFile('readme.txt', Buffer.from('hello'));
  const dir = tmpDir('noindex');
  assert.throws(() => extractZipSafe(zip.toBuffer(), dir), /index\.html/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects disallowed extension', () => {
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<html></html>'));
  zip.addFile('payload.exe', Buffer.from('MZ'));
  const dir = tmpDir('exe');
  assert.throws(() => extractZipSafe(zip.toBuffer(), dir), /不允许的文件类型/);
  fs.rmSync(dir, { recursive: true, force: true });
});

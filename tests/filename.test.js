'use strict';

const assert = require('assert');
const { decodeUploadFilename } = require('../server/lib/filename');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('filename decode');

test('leaves ascii alone', () => {
  assert.strictEqual(decodeUploadFilename('report.html'), 'report.html');
});

test('leaves already-correct CJK alone', () => {
  assert.strictEqual(
    decodeUploadFilename('智能化部署方案.html'),
    '智能化部署方案.html'
  );
});

test('repairs latin1 mojibake of chinese filename', () => {
  // Simulate multer latin1 mis-decode of UTF-8 filename
  const real = '运管共享模型方案汇报.html';
  const mojibake = Buffer.from(real, 'utf8').toString('latin1');
  assert.notStrictEqual(mojibake, real);
  assert.strictEqual(decodeUploadFilename(mojibake), real);
});

test('repairs the reported sample pattern', () => {
  // User-reported garbled tail (utf8 chinese bytes as latin1)
  const sample = Buffer.from('运管共享模型方案汇报.html', 'utf8').toString('latin1');
  const fixed = decodeUploadFilename(sample);
  assert.ok(/[\u4e00-\u9fff]/.test(fixed), fixed);
  assert.ok(fixed.endsWith('.html'));
});

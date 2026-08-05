'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const tests = ['zip.test.js', 'publish.test.js', 'shareUrl.test.js', 'filename.test.js'];
let failed = 0;

console.log('\nPageDrop tests\n');

for (const file of tests) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) failed += 1;
}

if (failed) {
  console.error(`\n${failed} suite(s) failed\n`);
  process.exit(1);
}

console.log('\nAll tests passed\n');

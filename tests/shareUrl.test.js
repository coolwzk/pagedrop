'use strict';

const assert = require('assert');
const {
  shareBaseUrl,
  absoluteShareUrl,
  isLoopbackHost,
  detectLanIPv4,
} = require('../server/lib/shareUrl');
const config = require('../server/config');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function fakeReq(host) {
  return {
    protocol: 'http',
    headers: {},
    get(name) {
      if (name === 'host') return host;
      return undefined;
    },
  };
}

console.log('shareUrl');

test('isLoopbackHost', () => {
  assert.strictEqual(isLoopbackHost('localhost'), true);
  assert.strictEqual(isLoopbackHost('127.0.0.1'), true);
  assert.strictEqual(isLoopbackHost('192.168.1.5'), false);
});

test('uses non-loopback request host', () => {
  const base = shareBaseUrl(fakeReq('10.0.0.8:3780'));
  assert.strictEqual(base, 'http://10.0.0.8:3780');
});

test('localhost falls back to LAN or localhost', () => {
  const prev = config.publicUrl;
  config.publicUrl = '';
  const base = shareBaseUrl(fakeReq('localhost:3780'));
  const lan = detectLanIPv4();
  if (lan) {
    assert.ok(base.includes(lan), `expected LAN ${lan} in ${base}`);
    assert.ok(!base.includes('localhost'));
  } else {
    assert.ok(base.includes('localhost'));
  }
  config.publicUrl = prev;
});

test('PUBLIC_URL wins', () => {
  const prev = config.publicUrl;
  config.publicUrl = 'http://pagedrop.local:3780';
  assert.strictEqual(shareBaseUrl(fakeReq('localhost:3780')), 'http://pagedrop.local:3780');
  assert.strictEqual(
    absoluteShareUrl(fakeReq('localhost:3780'), '/p/a/b/'),
    'http://pagedrop.local:3780/p/a/b/'
  );
  config.publicUrl = prev;
});

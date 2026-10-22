import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signSession,
  verifySession,
  isAllowedHost,
  isSameOrigin,
} from '../../apps/web/src/server/auth';
test('Signed local session rejects forged and expired cookies', () => {
  const key = 'unit-test-key-not-a-live-credential';
  const token = signSession(key, 1000);
  assert.equal(verifySession(token, key, 1001), true);
  assert.equal(verifySession(token + 'x', key, 1001), false);
  assert.equal(verifySession(token, 'different', 1001), false);
  assert.equal(verifySession(token, key, 1000 + 13 * 3600000), false);
});
test('Local-only host and origin checks reject remote host and CSRF', () => {
  assert.ok(isAllowedHost('127.0.0.1:3000'));
  assert.ok(isAllowedHost('localhost:3000'));
  assert.equal(isAllowedHost('localhost.evil.test'), false);
  assert.equal(isAllowedHost('192.168.1.10:3000'), false);
  assert.ok(isSameOrigin('http://localhost:3000', 'localhost:3000'));
  assert.equal(isSameOrigin('https://evil.test', 'localhost:3000'), false);
  assert.equal(isSameOrigin(null, 'localhost:3000'), false);
});

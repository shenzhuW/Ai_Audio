import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byteRange } from '../../apps/web/src/server/render/files';
test('Protected video byte ranges support seeking and reject invalid, excessive and multiple ranges', () => {
  assert.deepEqual(byteRange(null, 100), { start: 0, end: 99, status: 200 });
  assert.deepEqual(byteRange('bytes=10-19', 100), { start: 10, end: 19, status: 206 });
  assert.deepEqual(byteRange('bytes=20-', 100), { start: 20, end: 99, status: 206 });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99, status: 206 });
  for (const range of [
    'bytes=100-',
    'bytes=20-10',
    'bytes=-0',
    'bytes=1-2,3-4',
    'bytes=999999999999999999999-',
  ])
    assert.throws(() => byteRange(range, 100), { status: 416 });
});

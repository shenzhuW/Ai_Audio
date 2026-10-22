import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload } from '../../apps/web/src/server/storage';
test('Real upload validation checks extension, contents and byte limit', () => {
  assert.equal(validateUpload('notes.txt', Buffer.from('研究资料'), 100).mime, 'text/plain');
  assert.throws(() => validateUpload('notes.exe', Buffer.from('abc'), 100), {
    code: 'INVALID_FILE',
  });
  assert.throws(() => validateUpload('fake.png', Buffer.from('not png'), 100), {
    code: 'INVALID_FILE',
  });
  assert.throws(() => validateUpload('notes.txt', Buffer.from([0, 1, 2]), 100), {
    code: 'INVALID_FILE',
  });
  assert.throws(() => validateUpload('notes.txt', Buffer.alloc(101), 100), {
    code: 'UPLOAD_LIMIT',
  });
});

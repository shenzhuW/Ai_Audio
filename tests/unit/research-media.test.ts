import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { researchBlobStore } from '../../apps/web/src/server/research/storage';
test('Research upload accepts actual MP4 brand but rejects disguised executable, bad extensions and byte overflow', () => {
  const req = createRequire(resolve('package.json'));
  const modulePath = resolve('../../scripts/research-extract.cjs');
  // The explicit assertion produces a feature-missing failure before the adapter is implemented.
  assert.ok(require('node:fs').existsSync(modulePath), 'Research media adapter must exist');
  const { validateResearchUpload } = req(modulePath);
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  assert.equal(validateResearchUpload('test.mp4', bytes, 100).mime, 'video/mp4');
  assert.throws(() => validateResearchUpload('x.mp4', Buffer.from('MZ'), 100));
  assert.throws(() => validateResearchUpload('x.exe', bytes, 100));
  assert.throws(() => validateResearchUpload('x.mp4', bytes, 31), { code: 'UPLOAD_LIMIT' });
});

test('Local PDF parser loads standard fonts and extracts real pages/text with Windows-compatible paths', async () => {
  const { pdf } = require('../research/fixtures.cjs');
  const { analyze } = require('../../scripts/research-extract.cjs');
  const dir = await mkdtemp(resolve('../../.cache/pdf-parser-'));
  const blob = await researchBlobStore(resolve(dir, 'research-blobs'), 10000).put(
    'actual.pdf',
    pdf('SYNTHETIC ONLY. Capacity is 32 units.'),
  );
  const result = await analyze(
    { kind: 'analyze', blob, mode: 'real' },
    dir,
    resolve(dir, 'frames'),
    { maxVideoSeconds: 120, maxPdfPages: 50 },
  );
  assert.equal(result.metadata.pages, 1);
  assert.ok(result.entries[0].extractedText.includes('32 units.'));
  assert.equal(result.entries[0].provenance, 'real');
});

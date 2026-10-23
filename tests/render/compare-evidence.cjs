// Independent post-run verification. Compare structured values, not JSONB key order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../docs/evidence/phase02');
const read = (backend, file) => fs.readFileSync(path.join(root, backend, file));
const json = (backend, file) => JSON.parse(read(backend, file));
const manifests = ['sqlite', 'postgresql'].map((b) => json(b, 'manifest.json'));
const runs = ['sqlite', 'postgresql'].map((b) => json(b, 'results.json'));
for (const run of runs) assert.equal(run.status, 'PASS');
assert.deepEqual(manifests[0].input, manifests[1].input);
assert.equal(manifests[0].manifestHash, manifests[1].manifestHash);
const frames = [60, 150, 240].map((frame) => {
  const file = `frame-${String(frame).padStart(3, '0')}.png`;
  const hashes = ['sqlite', 'postgresql'].map((b) =>
    createHash('sha256').update(read(b, file)).digest('hex'),
  );
  assert.equal(hashes[0], hashes[1], `Independent render runs differ at frame ${frame}`);
  for (const run of runs) {
    const pair = run.checks
      .find((c) => c.detail.determinism)
      .detail.determinism.find((p) => p.frame === frame);
    assert.equal(pair.first, hashes[0]);
    assert.equal(pair.second, hashes[0]);
  }
  return { frame, sha256: hashes[0], sameWithinAndAcrossRuns: true };
});
const result = {
  status: 'PASS',
  at: new Date().toISOString(),
  runs: runs.map((r) => ({ backend: r.backend, runId: r.runId })),
  manifestHash: manifests[0].manifestHash,
  frames,
};
fs.writeFileSync(path.join(root, 'cross-run.json'), JSON.stringify(result, null, 2));
console.log(
  'PASS identical frozen inputs and exact PNG bytes within/across SQLite and PostgreSQL render runs',
);

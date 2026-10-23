// Read committed synthetic evidence and independently reproduce media extraction. No user DB writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
require('../../scripts/register-typescript.cjs');
const { researchBlobStore } = require('../../apps/web/src/server/research/storage.ts');
const { analyze } = require('../../scripts/research-extract.cjs');
const output = path.join(root, 'docs/evidence/phase03/remote');
const scratch = fs.mkdtempSync(path.join(root, '.cache/phase03-remote-'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const result = {
  status: 'RUNNING',
  at: new Date().toISOString(),
  codeCommit: '50bdda5bce8e83c821ab56a20a243f6aba778d7f',
  backends: [],
};
fs.mkdirSync(output, { recursive: true });
async function main() {
  const original = path.join(root, 'apps/render/public/background.mp4');
  const tool = process.env.STUDIO_FFMPEG_PATH || 'ffmpeg';
  const toolVersion = execFileSync(tool, ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
  }).split(/\r?\n/)[0];
  const frames = new Map();
  for (const timeMs of [0, 3333, 6666]) {
    const file = path.join(scratch, `frame-${timeMs}.jpg`);
    execFileSync(
      tool,
      [
        '-v',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(timeMs / 1000),
        '-i',
        original,
        '-frames:v',
        '1',
        '-vf',
        'scale=480:-2',
        '-q:v',
        '3',
        '-n',
        file,
      ],
      { windowsHide: true, timeout: 30000, stdio: 'pipe' },
    );
    frames.set(timeMs, sha(fs.readFileSync(file)));
  }
  const bytes = fs.readFileSync(path.join(root, 'fixtures/research/source-a.pdf'));
  const blob = await researchBlobStore(path.join(scratch, 'research-blobs'), 10000).put(
    'source-a.pdf',
    bytes,
  );
  const pdf = await analyze(
    { kind: 'analyze', blob, mode: 'real' },
    scratch,
    path.join(scratch, 'pdf'),
    { maxPdfPages: 50, maxVideoSeconds: 120 },
  );
  assert.equal(pdf.metadata.pages, 1);
  assert.equal(pdf.entries[0].page, 1);
  assert.ok(pdf.entries[0].extractedText.includes('Capacity is 32 units.'));
  result.pdf = {
    pages: 1,
    page: 1,
    extractedText: pdf.entries[0].extractedText,
    originalSha256: sha(bytes),
    provenance: 'real',
  };
  result.video = {
    toolVersion,
    originalSha256: sha(fs.readFileSync(original)),
    comparison: 'exact JPEG SHA256 at each recorded timestamp; no semantic recognition',
    frames: [...frames].map(([timeMs, sha256]) => ({ timeMs, sha256 })),
  };
  for (const backend of ['sqlite', 'postgresql']) {
    const dir = path.join(root, 'docs/evidence/phase03', backend);
    const saved = read(path.join(dir, 'results.json'));
    const data = read(path.join(dir, 'research-snapshot.json'));
    assert.equal(saved.status, 'PASS');
    assert.equal(saved.checks.length, backend === 'sqlite' ? 15 : 16);
    assert.ok(saved.checks.every((c) => c.status === 'PASS'));
    assert.ok(data.claims.every((c) => c.verificationStatus !== 'verified'));
    const conflict = data.claims.find((c) => c.verificationStatus === 'conflicting');
    assert.ok(conflict);
    const evidence = data.evidence.filter((e) => e.claimId === conflict.id);
    assert.equal(new Set(evidence.map((e) => e.sourceId)).size, 2);
    assert.ok(
      evidence.some(
        (e) =>
          e.role === 'support' &&
          e.locator.kind === 'page' &&
          e.locator.page === 1 &&
          e.validation === 'matched',
      ),
    );
    assert.ok(evidence.some((e) => e.role === 'refute' && e.validation === 'matched'));
    assert.ok(
      data.evidence.every(
        (e) =>
          e.revisionId === data.revision.id &&
          data.claims.some((c) => c.id === e.claimId && c.revisionId === e.revisionId),
      ),
    );
    const video = data.sources.find(
      (s) => s.sourceType === 'video' && s.blob.sha256 === result.video.originalSha256,
    );
    assert.ok(video);
    const segments = data.indexes
      .filter((e) => e.sourceId === video.id)
      .sort((a, b) => a.startMs - b.startMs);
    assert.deepEqual(
      segments.map((e) => [e.startMs, e.endMs]),
      [
        [0, 3333],
        [3333, 6666],
        [6666, 10000],
      ],
    );
    for (const segment of segments) {
      const frame = segment.frameRefs[0];
      assert.equal(frame.timeMs, segment.startMs);
      assert.equal(frame.blob.sha256, frames.get(frame.timeMs));
      assert.equal(
        sha(fs.readFileSync(path.join(dir, `frame-${frame.timeMs}.jpg`))),
        frames.get(frame.timeMs),
      );
    }
    const pdfSource = data.sources.find((s) => s.blob.sha256 === result.pdf.originalSha256);
    assert.ok(pdfSource);
    assert.ok(
      data.indexes.some(
        (e) =>
          e.sourceId === pdfSource.id &&
          e.page === 1 &&
          e.extractedText === result.pdf.extractedText,
      ),
    );
    const picture = data.sources.find(
      (s) =>
        s.sourceType === 'image' &&
        s.blob.sha256 === sha(fs.readFileSync(path.join(root, 'fixtures/research/diagram.png'))),
    );
    assert.equal(picture.metadata.width, 640);
    assert.equal(picture.metadata.height, 360);
    assert.ok(
      data.jobs.some(
        (j) =>
          j.researchResult?.kind === 'search' &&
          j.researchResult.mode === 'mock' &&
          j.researchResult.candidates.length === 0,
      ),
    );
    assert.ok(data.jobs.some((j) => j.errorCode === 'PROVIDER_NOT_CONFIGURED'));
    result.backends.push({
      backend,
      status: 'PASS',
      originalIntegrationChecks: saved.checks.length,
      claimId: conflict.id,
      sourceIds: evidence.map((e) => e.sourceId),
      evidenceIds: evidence.map((e) => e.id),
      state: conflict.verificationStatus,
      currentRevisionReferencesOnly: true,
      reproducedPdfPageAndText: true,
      reproducedFrames: 3,
      imageMetadata: { width: 640, height: 360, semanticUnderstanding: 'unconfigured' },
      mockSearchCandidates: 0,
      unconfiguredProviderFailureVisible: true,
    });
    console.log(
      `PASS ${backend}: evidence links, fork IDs, PDF page/text, source video frames, provider boundaries`,
    );
  }
  result.status = 'PASS';
}
main()
  .catch((e) => {
    result.status = 'FAIL';
    result.error = e.message;
    process.exitCode = 1;
    console.error(e.message);
  })
  .finally(() =>
    fs.writeFileSync(
      path.join(output, 'verification.json'),
      JSON.stringify(result, null, 2) + '\n',
    ),
  );

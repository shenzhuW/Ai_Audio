// Cross-check saved, real acceptance records. Does not replace actual HTTP/CLI runs.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'),
  dir = path.join(root, 'docs/evidence/phase045-claims');
const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const checks = [];
for (const [area, sqlite, postgres] of [
  ['', 13, 14],
  ['boundaries/', 4, 5],
  ['regression-phase03/', 15, 16],
  ['regression-phase04/', 9, 11],
]) {
  for (const [backend, count] of [
    ['sqlite', sqlite],
    ['postgresql', postgres],
  ]) {
    const file = area + backend + '/results.json',
      r = read(file);
    assert.equal(r.status, 'PASS', file);
    assert.equal(r.checks.length, count, file);
    assert.ok(r.checks.every((c) => c.status === 'PASS'));
    assert.deepEqual(r.pageErrors, []);
    checks.push({ file, status: r.status, checks: r.checks.length, runId: r.runId });
  }
}
for (const backend of ['sqlite', 'postgresql']) {
  const research = read(backend + '/research-snapshot.json'),
    script = read(backend + '/script-snapshot.json');
  const proof = read(backend + '/candidate-grounding.json'),
    job = research.jobs.find((j) => j.id === proof.jobId);
  assert.equal(job.researchInput.kind, 'claims');
  assert.equal(job.researchInput.revisionId, research.revision.id);
  assert.ok(job.researchInput.passages.every((p) => !('text' in p) && p.passageTextLength > 0));
  assert.ok(
    job.researchResult.candidates.every((c) => c.claim.verificationStatus === 'unverified'),
  );
  assert.equal(research.claims.length, 1);
  assert.ok(['unverified', 'conflicting'].includes(research.claims[0].verificationStatus));
  const accepted = job.claimCandidateReviews.find((r) => r.state === 'accepted');
  assert.equal(accepted.acceptedClaimId, research.claims[0].id);
  assert.ok(job.claimCandidateReviews.some((r) => r.state === 'rejected'));
  for (const e of proof.grounding) {
    const source = research.sources.find((s) => s.id === e.sourceId),
      index = research.indexes.find((i) => i.id === e.indexId);
    assert.equal(source.revisionId, research.revision.id);
    assert.equal(index.sourceId, source.id);
    assert.equal(source.blob.sha256, e.sourceSha256);
    assert.equal(index.extractedTextSha256, e.indexTextSha256);
    assert.equal(e.endChar - e.startChar, e.quote.length);
  }
  assert.equal(script.document.researchRevisionId, research.revision.id);
  assert.ok(
    script.segments.some((s) => s.factBindings.some((b) => b.claimId === accepted.acceptedClaimId)),
  );
  for (const segment of script.segments)
    for (const binding of segment.factBindings) {
      assert.ok(research.claims.some((c) => c.id === binding.claimId));
      assert.ok(
        binding.sourceIds.every(
          (id) =>
            research.sources.some((s) => s.id === id) &&
            research.evidence.some((e) => e.claimId === binding.claimId && e.sourceId === id),
        ),
      );
    }
  const captures = read(backend + '/captures.json');
  assert.equal(captures.status, 'PASS');
  for (const file of captures.images)
    assert.equal(sha(fs.readFileSync(path.join(dir, backend, file.file))), file.sha256);
  assert.ok(fs.statSync(path.join(dir, backend, '03-candidate-mobile-final.png')).size > 1000);
}
const cli = read('remote/cli-event-projection.json');
assert.equal(cli.status, 'PASS');
assert.equal(cli.runs.length, 21);
assert.equal(read('remote/injection-canary.json').status, 'PASS');
assert.equal(read('failures/research-sqlite-first.json').status, 'FAIL');
const browsers = read('failures/video-browser-diagnostic.json').rows;
assert.equal(browsers[0].errorCode, 4);
assert.equal(browsers[1].duration, 10);
assert.match(fs.readFileSync(path.join(dir, 'logs/unit.log'), 'utf8'), /pass 45/);
assert.match(fs.readFileSync(path.join(dir, 'logs/unit.log'), 'utf8'), /fail 0/);
const runtime = 'scripts/codex-runtime.cjs';
const prior = execFileSync('git', ['show', 'a6aee3746e704645e84a8870aaaeff8c4cd3278b:' + runtime], {
  cwd: root,
  maxBuffer: 1024 * 1024,
});
// Ignore CRLF checkout conversion when checking unchanged runtime source.
assert.equal(
  prior.toString().replace(/\r\n/g, '\n'),
  fs.readFileSync(path.join(root, runtime), 'utf8').replace(/\r\n/g, '\n'),
);
const record = {
  status: 'PASS',
  at: new Date().toISOString(),
  checks,
  realCliRuns: cli.runs.length,
  unitTests: 45,
  candidateReferenceChain: 'PASS',
  finalCaptures: 'PASS',
  runtimeUnchanged: true,
  excluded:
    'Exact quotes checked in actual HTTP run before originals were omitted from public snapshot; historical Windows native failures remain UNCONFIRMED.',
};
fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(record, null, 2) + '\n');
const files = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!['manifest.json', 'security-audit.json', 'commit-audit.json'].includes(entry.name)) {
      const b = fs.readFileSync(full);
      files.push({
        file: path.relative(root, full).replaceAll('\\', '/'),
        bytes: b.length,
        sha256: sha(b),
      });
    }
  }
}
walk(dir);
files.sort((a, b) => a.file.localeCompare(b.file));
fs.writeFileSync(
  path.join(dir, 'manifest.json'),
  JSON.stringify({ at: new Date().toISOString(), files }, null, 2) + '\n',
);
console.log(
  `PASS saved evidence cross-check: 8 real DB result sets, 45 unit tests, ${cli.runs.length} actual CLI runs; ${files.length} artifacts hashed`,
);

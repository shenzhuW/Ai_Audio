// Cross-check saved actual results; this command itself makes no model or network calls.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'),
  dir = path.join(root, 'docs/evidence/phase045');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const output = {
  at: new Date().toISOString(),
  status: 'RUNNING',
  mode: 'saved-real-evidence-cross-check',
  checks: [],
};
try {
  const events = read('remote/cli-event-projection.json');
  assert.equal(events.status, 'PASS');
  assert.equal(events.runs.length, 19);
  for (const backend of ['sqlite', 'postgresql']) {
    const r = read(backend + '/research-snapshot.json'),
      s = read(backend + '/script-snapshot.json');
    const partial = s.jobs.find(
      (j) => j.state === 'succeeded' && j.scriptInput?.mode === 'real' && j.scriptInput.segmentId,
    );
    const whole = s.jobs.find(
      (j) => j.state === 'succeeded' && j.scriptInput?.mode === 'real' && !j.scriptInput.segmentId,
    );
    assert.ok(partial && whole);
    // Model result carries editable fields; persistence assigns canonical order.
    const expected = partial.scriptInput.segments.map((x) =>
      x.id === partial.scriptInput.segmentId
        ? { ...partial.scriptResult.segments[0], order: x.order }
        : x,
    );
    assert.deepEqual(whole.scriptInput.segments, expected);
    for (const job of [partial, whole]) {
      assert.equal(job.scriptInput.researchRevisionId, r.revision.id);
      for (const x of job.scriptResult.segments)
        for (const binding of x.factBindings) {
          assert.ok(
            r.claims.some((c) => c.id === binding.claimId && c.revisionId === r.revision.id),
          );
          assert.ok(
            binding.sourceIds.every((id) =>
              r.sources.some((source) => source.id === id && source.revisionId === r.revision.id),
            ),
          );
        }
    }
    assert.deepEqual(
      partial.scriptResult.segments[0].factBindings,
      partial.scriptInput.segments.find((x) => x.id === partial.scriptInput.segmentId).factBindings,
    );
    assert.ok(r.claims.every((c) => c.verificationStatus === 'unverified'));
    for (const index of r.indexes.filter((x) => x.analysis)) {
      const run = events.runs.find((x) => x.runId === index.analysis.runId);
      assert.ok(run, 'Actual attachment events must exist');
      const source = r.sources.find((x) => x.id === index.sourceId);
      const attachmentSha = index.frameRefs?.length
        ? index.frameRefs[0].blob.sha256
        : source.blob.sha256;
      assert.ok(run.attachments.some((x) => x.sha256 === attachmentSha));
      assert.equal(index.analysis.sourceSha256, source.blob.sha256);
    }
    const restart = read('remote/' + backend + '-restart-fences.json');
    assert.equal(restart.status, 'PASS');
    assert.equal(restart.checks.length, 4);
    for (const item of restart.checks[3].detail)
      assert.equal(sha(fs.readFileSync(path.join(dir, 'remote', item.file))), item.sha256);
    output.checks.push({
      backend,
      status: 'PASS',
      partialJobId: partial.id,
      wholeJobId: whole.id,
      untouchedSegmentsExactlyEqual: true,
      partialBindingsExactlyEqual: true,
      fixedResearchRevisionId: r.revision.id,
      realAttachedImageHashesMatched: true,
      claimNote:
        'No AI Claim extractor is implemented. Search/vision do not create verified Claims; the manually created synthetic Claim remains unverified.',
      restartAndRecordedRealResponseFences: true,
    });
  }
  const retry = read('remote/failure-retry.json'),
    canary = read('remote/injection-canary.json');
  assert.equal(retry.status, 'PASS');
  assert.equal(retry.checks.length, 3);
  assert.equal(canary.status, 'PASS');
  assert.ok(canary.capturedCommandLine.includes('--sandbox read-only'));
  assert.ok(!canary.capturedCommandLine.includes('--yolo'));
  const diagnostics = read('remote/windows-native-incidents.json');
  assert.equal(diagnostics.incidents.length, 2);
  assert.equal(diagnostics.rootCause, 'UNCONFIRMED');
  assert.equal(diagnostics.incidents[0].taskAndDataInspection.runningJobs.length, 0);
  assert.equal(diagnostics.incidents[0].taskAndDataInspection.realAiRuns, 0);
  output.realModelRunsProjected = events.runs.length;
  output.actualAbnormalExitAndRetry = true;
  output.actualInjectionCanary = true;
  output.nativeWindowsRootCauseKnown = false;
  output.status = 'PASS';
} catch (e) {
  output.status = 'FAIL';
  output.error = e.message;
  process.exitCode = 1;
}
fs.writeFileSync(
  path.join(dir, 'remote/verification.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(JSON.stringify(output, null, 2));

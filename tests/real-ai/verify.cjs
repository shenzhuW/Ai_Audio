// Independent evidence checks; reads saved runs, never claims to re-call a model.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'),
  dir = path.join(root, 'docs/evidence/phase045');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function normalize(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) normalize(file);
    else if (/\.(json|log)$/.test(file)) {
      const b = fs.readFileSync(file);
      const text =
        b[0] === 255 && b[1] === 254
          ? b.subarray(2).toString('utf16le')
          : b.toString('utf8').replace(/^\uFEFF/, '');
      fs.writeFileSync(
        file,
        text
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+$/gm, '')
          .trimEnd() + '\n',
      );
    }
  }
}
const result = {
  status: 'RUNNING',
  at: new Date().toISOString(),
  mode: 'saved-real-evidence-cross-check',
  backends: [],
  failures: [],
};
fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
try {
  normalize(dir);
  const environment = read(path.join(dir, 'codex-environment.json'));
  assert.equal(environment.status, 'PASS');
  assert.equal(environment.effectiveEnabledMcpCount, 0);
  const safety = read(path.join(dir, 'cli/safety.json'));
  assert.equal(safety.status, 'PASS');
  assert.equal(safety.value.nodeFileAccess, false);
  assert.ok(
    safety.value.toolNames.every((n) =>
      ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].includes(n),
    ),
  );
  const timeout = read(path.join(dir, 'cli/timeout.json'));
  assert.equal(timeout.status, 'PASS');
  assert.equal(timeout.actual, 'CODEX_TIMEOUT');
  for (const mode of ['structured', 'search', 'image', 'video'])
    assert.equal(read(path.join(dir, 'cli', mode + '.json')).status, 'PASS');
  const sourceVideoSha = sha(fs.readFileSync(path.join(root, 'apps/render/public/background.mp4')));
  for (const backend of ['sqlite', 'postgresql']) {
    const folder = path.join(dir, backend),
      saved = read(path.join(folder, 'results.json')),
      research = read(path.join(folder, 'research-snapshot.json')),
      script = read(path.join(folder, 'script-snapshot.json')),
      captures = read(path.join(folder, 'captures.json'));
    assert.equal(saved.status, 'PASS');
    assert.equal(saved.checks.length, backend === 'sqlite' ? 9 : 10);
    assert.ok(saved.checks.every((c) => c.status === 'PASS'));
    assert.deepEqual(saved.pageErrors, []);
    assert.equal(captures.status, 'PASS');
    assert.deepEqual(captures.pageErrors, []);
    assert.equal(captures.images.length, 6);
    for (const image of captures.images) {
      const bytes = fs.readFileSync(path.join(folder, image.file));
      assert.equal(sha(bytes), image.sha256);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
    assert.ok(
      !JSON.stringify(research).includes('"extractedText":'),
      'Full fetched text must remain private',
    );
    const searches = research.jobs.filter(
      (j) => j.researchResult?.kind === 'search' && j.researchResult.mode === 'real',
    );
    assert.ok(searches.length);
    for (const job of searches) {
      assert.ok(job.aiRuns.some((a) => a.searchMode === 'live' && a.runId));
      for (const c of job.researchResult.candidates) {
        assert.ok(job.researchResult.searchTrace.some((t) => t.urls.includes(c.url)));
        if (c.fetchStatus === 'fetched') {
          const source = research.sources.find((s) => s.sourceUrl === c.url);
          assert.ok(source?.webCapture);
          assert.equal(source.webCapture.rawBlob.sha256, source.webCapture.rawSha256);
          const entry = research.indexes.find((e) => e.sourceId === source.id);
          assert.equal(entry.extractedTextSha256, source.blob.sha256);
          assert.notEqual(entry.extractedTextPreview, source.webCapture.modelSummary);
        }
      }
    }
    const video = research.sources.find((s) => s.blob.sha256 === sourceVideoSha);
    assert.ok(video);
    const frames = research.indexes
      .filter((e) => e.sourceId === video.id && e.analysis)
      .sort((a, b) => a.startMs - b.startMs);
    assert.deepEqual(
      frames.map((e) => e.startMs),
      [0, 3333, 6666],
    );
    for (const frame of frames) {
      assert.equal(frame.analysis.sourceSha256, sourceVideoSha);
      assert.equal(frame.analysis.frameTimeMs, frame.startMs);
      assert.equal(
        sha(fs.readFileSync(path.join(folder, 'frame-' + frame.startMs + '.jpg'))),
        frame.frameRefs[0].blob.sha256,
      );
      assert.equal(frame.extractedTextSha256, undefined);
    }
    assert.ok(research.claims.every((c) => c.verificationStatus === 'unverified'));
    assert.equal(script.document.researchRevisionId, research.revision.id);
    for (const segment of script.segments)
      for (const binding of segment.factBindings) {
        assert.ok(
          research.claims.some(
            (c) => c.id === binding.claimId && c.revisionId === script.document.researchRevisionId,
          ),
        );
        assert.ok(
          binding.sourceIds.every((id) =>
            research.sources.some(
              (s) => s.id === id && s.revisionId === script.document.researchRevisionId,
            ),
          ),
        );
      }
    const written = script.jobs.filter(
      (j) => j.scriptInput?.mode === 'real' && j.state === 'succeeded',
    );
    assert.equal(written.length, 2);
    assert.ok(written.every((j) => j.scriptResult.mode === 'real'));
    const cancelled = script.jobs.find(
      (j) => j.scriptInput?.mode === 'real' && j.state === 'cancelled',
    );
    assert.ok(cancelled);
    assert.equal(cancelled.leaseOwner, null);
    assert.ok(cancelled.aiRuns.some((a) => a.failureReason === 'CODEX_CANCELLED'));
    const audits = [...research.jobs, ...script.jobs].flatMap((j) => j.aiRuns || []);
    assert.ok(audits.length >= 8);
    for (const a of audits) {
      assert.equal(a.provider, 'codex-cli');
      assert.equal(a.cliVersion, 'codex-cli 0.163.0');
      assert.equal(a.model, 'gpt-6.1-sol');
      assert.equal(a.quota, null);
      assert.equal(a.isolation.enabledMcpServers, 0);
      assert.equal(a.isolation.modelShell, 'disabled');
    }
    result.backends.push({
      backend,
      status: 'PASS',
      runId: saved.runId,
      groups: saved.checks.length,
      actualModelRuns: audits.length,
      successfulRuns: audits.filter((a) => !a.failureReason).length,
      cancelledAudit: cancelled.aiRuns,
      fullOriginalsKeptPrivate: true,
      screenshotCount: captures.images.length,
      tokenUsage: audits.reduce(
        (total, a) => total + (a.usage?.input_tokens || 0) + (a.usage?.output_tokens || 0),
        0,
      ),
      remainingQuota: 'unknown',
    });
  }
  for (const [phase, counts] of [
    ['phase04', [9, 11]],
    ['phase03', [15, 16]],
  ])
    for (const [i, backend] of ['sqlite', 'postgresql'].entries()) {
      const r = read(path.join(dir, 'regression', phase, backend, 'results.json'));
      assert.equal(r.status, 'PASS');
      assert.equal(r.checks.length, counts[i]);
      assert.ok(r.checks.every((c) => c.status === 'PASS'));
    }
  const unit = fs.readFileSync(path.join(dir, 'unit-tests.log'), 'utf8');
  assert.match(unit, /tests 36/);
  assert.match(unit, /pass 36/);
  assert.match(unit, /fail 0/);
  assert.match(fs.readFileSync(path.join(dir, 'build.log'), 'utf8'), /Compiled successfully/);
  assert.equal(
    execFileSync(
      'git',
      ['diff', '--name-only', 'HEAD', '--', 'apps/web/prisma', 'apps/render', 'pnpm-lock.yaml'],
      { cwd: root, encoding: 'utf8' },
    ).trim(),
    '',
  );
  for (const file of ['docs/PHASE_04_5_DELIVERY.md', 'fixtures/real-ai/README.md']) {
    const full = path.join(root, file);
    for (const m of fs.readFileSync(full, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(m[1])) continue;
      assert.ok(
        fs.existsSync(path.resolve(path.dirname(full), m[1].split('#')[0])),
        file + ': ' + m[1],
      );
    }
  }
  result.status = 'PASS';
  result.unitTests = 36;
  result.prismaRenderAndLockUnchanged = true;
} catch (e) {
  result.status = 'FAIL';
  result.failures.push(e.message);
  process.exitCode = 1;
}
fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      status: result.status,
      backends: result.backends.map((b) => ({
        backend: b.backend,
        groups: b.groups,
        actualModelRuns: b.actualModelRuns,
      })),
      failures: result.failures,
    },
    null,
    2,
  ),
);

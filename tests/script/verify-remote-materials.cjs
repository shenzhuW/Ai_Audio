// Verify saved real integration evidence without touching databases or user files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/evidence/phase04/remote');
const codeCommit = '94189c817393e6a374b395969b66e373c9bfe1c6';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const screenshots = ['04-user-script.png', '04-claims-conflict.png', '04-diff.png', '04-approved.png',
  '04-mobile.png', '04-history.png', '04-rejected.png', '04-downstream-impact.png',
  '04-mock-unconfigured.png', '04-research-impact.png'];
const result = { at: new Date().toISOString(), codeCommit, status: 'RUNNING', backends: [] };
try {
  // PowerShell redirection may use UTF-16; publish the same output as readable UTF-8.
  function normalize(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) normalize(file);
      else if (/\.(log|json)$/.test(file)) {
        const bytes = fs.readFileSync(file);
        const text = bytes[0] === 255 && bytes[1] === 254
          ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
        fs.writeFileSync(file, text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n');
      }
    }
  }
  normalize(output);
  for (const backend of ['sqlite', 'postgresql']) {
    const dir = path.join(output, backend), saved = read(path.join(dir, 'results.json'));
    const snapshot = read(path.join(dir, 'script-snapshot.json'));
    assert.equal(saved.status, 'PASS');
    assert.equal(saved.checks.length, backend === 'sqlite' ? 9 : 11);
    assert.ok(saved.checks.every((c) => c.status === 'PASS'));
    assert.deepEqual(saved.pageErrors, []);
    const check = (text) => {
      const found = saved.checks.find((c) => c.name.includes(text));
      assert.ok(found, text);
      return found.detail;
    };
    assert.deepEqual(check('真实并发409').statuses, [200, 409]);
    const binding = check('双来源引用一致'), fork = check('Fork清空旧Claim');
    assert.equal(binding.refreshedBoundSecond.factBindings[0].claimId, binding.claimId);
    assert.deepEqual(binding.refreshedBoundSecond.factBindings[0].sourceIds, binding.sourceIds);
    assert.ok(binding.refreshedBoundSecond.text.includes('刷新后仍须保留引用'));
    assert.equal(fork.sameResearchFork.referencesPreserved, true);
    assert.equal(fork.sameResearchFork.researchRevisionId, fork.oldResearch);
    assert.equal(fork.oldIdsRejected, 422);
    assert.equal(snapshot.document.researchRevisionId, fork.newResearch);
    for (const segment of snapshot.segments) for (const b of segment.factBindings) {
      assert.notEqual(b.claimId, binding.claimId);
      assert.ok(snapshot.research.claims.some((c) => c.id === b.claimId && c.revisionId === fork.newResearch));
      for (const id of b.sourceIds) {
        assert.ok(snapshot.research.sources.some((s) => s.id === id && s.revisionId === fork.newResearch));
        assert.ok(snapshot.research.evidence.some((e) => e.claimId === b.claimId && e.sourceId === id && e.revisionId === fork.newResearch));
      }
    }
    assert.ok(snapshot.research.claims.some((c) => c.verificationStatus === 'unverified'));
    assert.ok(snapshot.research.claims.some((c) => c.verificationStatus === 'conflicting'));
    assert.ok(snapshot.research.claims.every((c) => c.verificationStatus !== 'verified'));
    assert.equal(snapshot.document.provenance, 'mock');
    assert.equal(snapshot.revision.mock, true);
    assert.ok(snapshot.jobs.some((j) => j.errorCode === 'PROVIDER_NOT_CONFIGURED'));
    for (const name of ['source-a.txt', 'source-b.txt']) {
      const text = fs.readFileSync(path.join(root, 'fixtures/script', name), 'utf8').trim();
      assert.ok(snapshot.research.sources.some((s) => s.blob.sha256 === sha(Buffer.from(text))));
    }
    const images = screenshots.map((name) => {
      const bytes = fs.readFileSync(path.join(dir, name));
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      return { file: backend + '/' + name, sha256: sha(bytes), bytes: bytes.length };
    });
    result.backends.push({ backend, status: 'PASS', runId: saved.runId, integrationGroups: saved.checks.length,
      refreshedBoundSecond: binding.refreshedBoundSecond, sameResearchFork: fork.sameResearchFork,
      currentResearchRevisionId: fork.newResearch, claimSourceRevisionConsistency: true,
      conflictingAndUnverifiedRetained: true, mockAndUnconfiguredSeparated: true, screenshots: images });
  }
  const log = fs.readFileSync(path.join(output, 'unit-tests.log'), 'utf8');
  assert.match(log, /tests 29/);
  assert.match(log, /pass 29/);
  assert.match(log, /fail 0/);
  for (const relative of ['docs/PHASE_04_DELIVERY.md', 'docs/PHASE_04_REMOTE_ACCEPTANCE.md', 'fixtures/script/README.md']) {
    const file = path.join(root, relative);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(m[1])) continue;
      const target = m[1].split('#')[0];
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), relative + ': ' + target);
    }
  }
  result.evidenceLinksExist = true;
  const changed = execFileSync('git', ['diff', '--name-only', codeCommit, '--', 'apps', 'scripts', 'package.json', 'pnpm-lock.yaml'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(changed, '', 'Accepted application and workers must remain unchanged');
  result.applicationUnchanged = true;
  result.unitTests = { pass: 29, fail: 0 };
  result.status = 'PASS';
} catch (e) {
  result.status = 'FAIL';
  result.error = e.message;
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, backends: result.backends.map((b) => ({ backend: b.backend, groups: b.integrationGroups })), error: result.error }, null, 2));
}

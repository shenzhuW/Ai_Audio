import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';

function researchHarness() {
  const h = harness();
  const run = (command: unknown, key = randomUUID()) => h.run(command as any, key);
  const r = run({
    action: 'create',
    type: 'research',
    text: 'Actual test report; no verified facts',
    inputRevisionIds: [],
  });
  const revision = () => h.state().revisions.find((x) => x.id === r.id)!;
  const edit = (action: string, data: object) =>
    run({ action, revisionId: r.id, expectedVersion: revision().version, ...data });
  const source = (title: string) =>
    edit('research-source', {
      source: {
        title,
        sourceType: 'text',
        publisher: 'Self-authored test',
        creator: 'Test author',
        publishedAt: null,
        knownRestrictions: 'Noncommercial test',
        licenseStatus: 'blocked',
        blob: {
          id: randomUUID(),
          name: title + '.txt',
          mime: 'text/plain',
          sizeBytes: 50,
          sha256: 'a'.repeat(64),
        },
      },
    });
  return { h, run, r, revision, edit, source };
}

test('Research records are revision-bound; missing evidence and Mock cannot become verified facts', () => {
  const t = researchHarness(),
    a = t.source('Source A'),
    b = t.source('Source B');
  assert.equal((t.h.state() as any).researchSources.length, 2);
  assert.equal(a.licenseStatus, 'blocked', 'D-17 does not block internal test sources');
  const claim = t.edit('research-claim', {
    claim: {
      text: 'Synthetic capacity is 32 units',
      asOf: '2026-10-23',
      scope: 'Synthetic fixture only',
      unit: 'units',
      caveats: 'Not a real measurement',
      verificationStatus: 'unverified',
    },
  });
  assert.throws(() =>
    t.edit('research-claim', {
      claimId: claim.id,
      claim: { ...claim, verificationStatus: 'verified' },
    }),
  );
  assert.throws(
    () =>
      t.edit('research-claim', {
        claimId: claim.id,
        claim: {
          text: claim.text,
          asOf: claim.asOf,
          scope: claim.scope,
          unit: claim.unit,
          caveats: claim.caveats,
          verificationStatus: 'supported',
        },
      }),
    { code: 'EVIDENCE_REQUIRED' },
  );
  assert.throws(
    () =>
      t.edit('research-evidence', {
        claimId: claim.id,
        sourceId: randomUUID(),
        role: 'support',
        quote: '32 units',
        locator: { kind: 'text', label: 'paragraph 1' },
      }),
    { code: 'NOT_FOUND' },
  );
  const evidence = t.edit('research-evidence', {
    claimId: claim.id,
    sourceId: a.id,
    role: 'support',
    quote: '32 units',
    locator: { kind: 'text', label: 'paragraph 1' },
  });
  assert.equal(evidence.validation, 'unvalidated');
  t.edit('research-evidence', {
    claimId: claim.id,
    sourceId: b.id,
    role: 'refute',
    quote: '64 units',
    locator: { kind: 'text', label: 'paragraph 1' },
  });
  assert.equal((t.h.state() as any).researchClaims[0].verificationStatus, 'conflicting');
  const state = t.h.state(),
    version = t.revision().version;
  assert.throws(
    () =>
      t.run({
        action: 'research-source-edit',
        revisionId: t.r.id,
        expectedVersion: version - 1,
        sourceId: a.id,
        selected: false,
      }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.deepEqual(t.h.state(), state, 'failed edit rolls back all research records');
});

test('Research approval freezes source/claim/evidence/index and fork copies a coherent snapshot', () => {
  const t = researchHarness(),
    a = t.source('Source A');
  const claim = t.edit('research-claim', {
    claim: {
      text: 'Synthetic capacity is 32 units',
      asOf: '2026-10-23',
      scope: 'Test',
      unit: 'units',
      caveats: 'Synthetic',
      verificationStatus: 'unverified',
    },
  });
  t.edit('research-evidence', {
    claimId: claim.id,
    sourceId: a.id,
    role: 'support',
    quote: '32 units',
    locator: { kind: 'text', label: 'paragraph 1' },
  });
  const job = t.edit('research-analyze', { sourceId: a.id, mode: 'real' });
  t.run({ action: 'claim', jobId: job.id, workerId: 'research-test' });
  const result = t.run({
    action: 'finish',
    jobId: job.id,
    workerId: 'research-test',
    researchResult: {
      kind: 'analyze',
      mode: 'real',
      metadata: { mime: 'text/plain', sizeBytes: 50, sha256: 'a'.repeat(64) },
      entries: [
        {
          contentType: 'text',
          summary: 'Local extracted text, not fact verification',
          extractedText: 'Synthetic capacity is 32 units',
          keywords: [],
          provenance: 'real',
        },
      ],
      warnings: [],
    },
  });
  assert.equal(result.state, 'succeeded');
  assert.equal((t.h.state() as any).researchEvidence[0].validation, 'matched');
  assert.equal(
    (t.h.state() as any).researchClaims[0].verificationStatus,
    'unverified',
    'extraction never verifies a claim',
  );
  const submitted = t.run({
    action: 'submit',
    revisionId: t.r.id,
    expectedVersion: t.revision().version,
  });
  const approved = t.run({
    action: 'approve',
    revisionId: t.r.id,
    expectedVersion: submitted.version,
    comment: 'Review fixture',
  });
  const before = structuredClone(t.h.state());
  assert.throws(() => t.edit('research-source-edit', { sourceId: a.id, selected: false }), {
    code: 'IMMUTABLE_REVISION',
  });
  const fork = t.run({ action: 'fork', revisionId: t.r.id, expectedVersion: approved.version });
  const after = t.h.state() as any;
  const source = after.researchSources.find((x: any) => x.revisionId === fork.id),
    copy = after.researchEvidence.find((x: any) => x.revisionId === fork.id);
  assert.notEqual(source.id, a.id);
  assert.equal(source.blob.id, a.blob.id, 'fork reuses immutable original bytes');
  assert.equal(copy.sourceId, source.id);
  assert.equal(after.researchClaims.find((x: any) => x.revisionId === fork.id).id, copy.claimId);
  for (const key of ['researchSources', 'researchClaims', 'researchEvidence', 'researchIndexes'])
    assert.deepEqual(
      after[key].filter((x: any) => x.revisionId === t.r.id),
      (before as any)[key],
    );
});

test('Research analysis uses durable jobs, idempotent enqueue and fences approval/cancelled results', () => {
  const t = researchHarness(),
    a = t.source('Source A');
  const command = {
    action: 'research-analyze',
    revisionId: t.r.id,
    expectedVersion: t.revision().version,
    sourceId: a.id,
    mode: 'mock',
  };
  const job = t.run(command, 'analysis-once');
  assert.equal(job.provider, 'research');
  assert.deepEqual(t.run(command, 'analysis-once'), job);
  const active = t.run({ action: 'claim', jobId: job.id, workerId: 'worker-one' });
  t.run({ action: 'cancel', jobId: job.id, expectedVersion: active.version });
  assert.throws(
    () =>
      t.run({ action: 'finish', jobId: job.id, workerId: 'worker-one', errorCode: 'TEST_FAILURE' }),
    { code: 'JOB_CONFLICT' },
  );
  assert.equal((t.h.state() as any).researchIndexes.length, 0);
  const other = t.edit('research-analyze', { sourceId: a.id, mode: 'real' });
  t.run({ action: 'claim', jobId: other.id, workerId: 'worker-two' });
  const s = t.run({ action: 'submit', revisionId: t.r.id, expectedVersion: t.revision().version });
  t.run({ action: 'approve', revisionId: t.r.id, expectedVersion: s.version, comment: '' });
  const late = t.run({
    action: 'finish',
    jobId: other.id,
    workerId: 'worker-two',
    researchResult: {
      kind: 'analyze',
      mode: 'real',
      metadata: { mime: 'text/plain', sizeBytes: 50, sha256: 'a'.repeat(64) },
      entries: [],
      warnings: [],
    },
  });
  assert.equal(late.state, 'failed');
  assert.equal(late.errorCode, 'TARGET_CHANGED');
});

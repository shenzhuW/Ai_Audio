import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
import {
  claimInput,
  groundCandidates,
  validateClaimInput,
} from '../../apps/web/src/server/research/claim-candidates';
// Deterministic engine fixtures, NOT real model calls. Real CLI proof is a separate integration run.
function setup(withText = true) {
  const h = harness(),
    run = (c: any, key = randomUUID()) => h.run(c, key);
  const r = run({
    action: 'create',
    type: 'research',
    text: 'Synthetic claim acceptance',
    inputRevisionIds: [],
  });
  const current = () => h.state().revisions.find((x) => x.id === r.id)!;
  const edit = (action: string, body = {}) =>
    run({ action, revisionId: r.id, expectedVersion: current().version, ...body });
  const text = '自制测试记录：样品甲的标注容量为32单位。此记录仅供内部测试，不是独立测量。';
  const source = edit('research-source', {
    source: {
      title: 'Self-authored fixture',
      sourceType: 'text',
      blob: {
        id: randomUUID(),
        name: 'fixture.txt',
        mime: 'text/plain',
        sizeBytes: Buffer.byteLength(text),
        sha256: createHash('sha256').update(text).digest('hex'),
      },
    },
  });
  if (withText) {
    const j = edit('research-analyze', { sourceId: source.id, mode: 'real' });
    run({ action: 'claim', jobId: j.id, workerId: 'parser' });
    run({
      action: 'finish',
      jobId: j.id,
      workerId: 'parser',
      researchResult: {
        kind: 'analyze',
        mode: 'real',
        metadata: {
          mime: source.blob.mime,
          sizeBytes: source.blob.sizeBytes,
          sha256: source.blob.sha256,
        },
        entries: [
          {
            contentType: 'text',
            summary: 'Real fixture bytes',
            keywords: [],
            extractedText: text,
            provenance: 'real',
          },
        ],
        warnings: [],
      },
    });
  }
  const enqueue = () => edit('research-claims', {});
  const candidate = () => ({
    id: randomUUID(),
    claim: {
      text: '测试记录标注样品甲容量32单位',
      asOf: null,
      scope: '自制样例',
      unit: '单位',
      caveats: '非独立测量',
      verificationStatus: 'unverified',
    },
    conflictNote: '没有第二份独立资料，不能核实。',
    evidence: [
      {
        sourceId: source.id,
        indexId: h.state().researchIndexes[0].id,
        role: 'support',
        quote: '样品甲的标注容量为32单位。',
      },
    ],
  });
  const audit = {
    provider: 'codex-cli',
    cliVersion: 'codex-cli 0.163.0',
    model: 'unit-fixture',
    runId: 'unit-not-real',
    searchMode: 'disabled',
    startedAt: new Date().toISOString(),
    durationMs: 1,
    usage: null,
    quota: null,
    quotaNote: 'unit fixture',
    failureReason: null,
    policy: 'data-only-v1',
    catalogSha256: null,
  };
  const finish = (j: any, candidates: any[]) =>
    run({
      action: 'finish',
      jobId: j.id,
      workerId: 'candidate-worker',
      researchResult: {
        kind: 'claims',
        mode: 'real',
        status: candidates.length ? 'ready' : 'insufficient',
        notes: candidates.length ? '待人工审核' : '缺少原文',
        candidates,
        aiRuns: candidates.length ? [audit] : [],
      },
    });
  return { h, run, edit, r, current, source, enqueue, candidate, finish };
}
test('Claim candidates persist separately; edit/reject/accept are explicit and accepted quotes stay unverified', () => {
  const t = setup(),
    j = t.enqueue();
  t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
  const a = t.candidate(),
    b = t.candidate();
  assert.equal(t.finish(j, [a, b]).state, 'succeeded');
  assert.equal(t.h.state().researchClaims.length, 0);
  assert.equal(t.h.state().researchEvidence.length, 0);
  const revised = {
    claim: { ...a.claim, text: '用户编辑：记录标注32单位' },
    evidence: a.evidence,
    conflictNote: a.conflictNote,
  };
  t.edit('research-candidate-review', {
    jobId: j.id,
    candidateId: a.id,
    decision: 'edit',
    candidate: revised,
  });
  assert.equal(t.h.state().researchClaims.length, 0);
  const command = {
    action: 'research-candidate-review',
    revisionId: t.r.id,
    expectedVersion: t.current().version,
    jobId: j.id,
    candidateId: a.id,
    decision: 'accept',
  };
  const first = t.run(command, 'accept-once');
  assert.deepEqual(t.run(command, 'accept-once'), first);
  assert.equal(t.h.state().researchClaims.length, 1);
  assert.equal(t.h.state().researchClaims[0].text, revised.claim.text);
  assert.equal(t.h.state().researchClaims[0].verificationStatus, 'unverified');
  assert.equal(t.h.state().researchEvidence[0].validation, 'matched');
  const persisted = t.h.state().jobs.find((x) => x.id === j.id)! as any;
  const review = persisted.claimCandidateReviews.find((x: any) => x.candidateId === a.id);
  assert.equal(review.state, 'accepted');
  assert.equal(review.acceptedClaimId, t.h.state().researchClaims[0].id);
  assert.ok(
    review.candidate.evidence[0].match.endChar > review.candidate.evidence[0].match.startChar,
  );
  t.edit('research-candidate-review', { jobId: j.id, candidateId: b.id, decision: 'reject' });
  assert.equal(t.h.state().researchClaims.length, 1);
  assert.throws(
    () =>
      t.edit('research-candidate-review', { jobId: j.id, candidateId: b.id, decision: 'accept' }),
    { code: 'CANDIDATE_ALREADY_REVIEWED' },
  );
});
test('Candidate generation rejects invented source IDs, nonliteral quotes and attempted verification', () => {
  for (const kind of ['source', 'quote', 'verification']) {
    const t = setup(),
      j = t.enqueue(),
      candidate = t.candidate();
    t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
    if (kind === 'source') candidate.evidence[0].sourceId = randomUUID();
    if (kind === 'quote') candidate.evidence[0].quote = '样品甲已被证实为64单位。';
    if (kind === 'verification') (candidate.claim as any).verificationStatus = 'supported';
    if (kind === 'verification') assert.throws(() => t.finish(j, [candidate]));
    else {
      const done = t.finish(j, [candidate]);
      assert.equal(done.state, 'failed');
      assert.match(done.errorCode, /INVALID_CANDIDATE_SOURCE|INVALID_CLAIM_QUOTE/);
    }
    assert.equal(t.h.state().researchClaims.length, 0);
    assert.equal(t.h.state().researchEvidence.length, 0);
  }
});
test('Missing original text creates an explicit insufficient result and no fake evidence', () => {
  const t = setup(false),
    j = t.enqueue();
  assert.equal(j.researchInput.passages.length, 0);
  t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
  const done = t.finish(j, []);
  assert.equal(done.researchResult.status, 'insufficient');
  assert.deepEqual(done.researchResult.aiRuns, []);
  assert.equal(t.h.state().researchClaims.length, 0);
});
test('Approved research and changed input versions fence late candidate generation', () => {
  for (const approve of [true, false]) {
    const t = setup(),
      j = t.enqueue(),
      candidate = t.candidate();
    t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
    if (approve) t.h.approve(t.current());
    else t.edit('research-source-edit', { sourceId: t.source.id, selected: false });
    const before = JSON.stringify(t.h.state().researchClaims);
    const done = t.finish(j, [candidate]);
    assert.equal(done.errorCode, 'TARGET_CHANGED');
    assert.equal(JSON.stringify(t.h.state().researchClaims), before);
    assert.equal(done.leaseOwner, null);
  }
});
test('Candidate review enforces concurrent version, current source integrity and immutable revisions', () => {
  const t = setup(),
    j = t.enqueue(),
    candidate = t.candidate();
  t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
  t.finish(j, [candidate]);
  const old = t.current().version;
  t.edit('research-source-edit', { sourceId: t.source.id, selected: false });
  assert.throws(
    () =>
      t.run({
        action: 'research-candidate-review',
        revisionId: t.r.id,
        expectedVersion: old,
        jobId: j.id,
        candidateId: candidate.id,
        decision: 'accept',
      }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.throws(
    () =>
      t.edit('research-candidate-review', {
        jobId: j.id,
        candidateId: candidate.id,
        decision: 'accept',
      }),
    { code: 'CANDIDATE_INPUT_CHANGED' },
  );
  t.h.approve(t.current());
  assert.throws(
    () =>
      t.edit('research-candidate-review', {
        jobId: j.id,
        candidateId: candidate.id,
        decision: 'reject',
      }),
    { code: 'IMMUTABLE_REVISION' },
  );
});
test('Fork never accepts old candidates or old Source IDs; accepted formal claims follow existing clone mapping', () => {
  const t = setup(),
    j = t.enqueue(),
    candidate = t.candidate();
  t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
  t.finish(j, [candidate]);
  t.edit('research-candidate-review', {
    jobId: j.id,
    candidateId: candidate.id,
    decision: 'accept',
  });
  const approved = t.h.approve(t.current());
  const fork = t.run({
    action: 'fork',
    revisionId: approved.id,
    expectedVersion: approved.version,
  });
  assert.throws(
    () =>
      t.run({
        action: 'research-candidate-review',
        revisionId: fork.id,
        expectedVersion: fork.version,
        jobId: j.id,
        candidateId: candidate.id,
        decision: 'accept',
      }),
    { code: 'INVALID_CANDIDATE_JOB' },
  );
  const newClaim = t.h.state().researchClaims.find((x) => x.revisionId === fork.id)!;
  const evidence = t.h.state().researchEvidence.find((x) => x.claimId === newClaim.id)!;
  assert.notEqual(evidence.sourceId, t.source.id);
  assert.equal(
    t.h.state().researchSources.find((x) => x.id === evidence.sourceId)?.revisionId,
    fork.id,
  );
});

test('Candidate inputs exclude Mock, summaries and vision descriptions; limits are explicit and hashes bind full extracted text', () => {
  const t = setup(),
    state = structuredClone(t.h.state()),
    original = state.researchIndexes[0];
  original.provenance = 'mock';
  assert.equal(claimInput(state, t.current()).passages.length, 0);
  original.provenance = 'real';
  original.analysis = {
    kind: 'model-vision',
    model: 'unit',
    runId: 'unit',
    sourceSha256: t.source.blob.sha256,
  };
  assert.equal(claimInput(state, t.current()).passages.length, 0);
  delete original.analysis;
  delete original.extractedText;
  original.summary = 'Model summary must never count as a quotation';
  assert.equal(claimInput(state, t.current()).passages.length, 0);
  original.extractedText = '甲'.repeat(20000);
  state.researchIndexes = Array.from({ length: 22 }, () => ({ ...original, id: randomUUID() }));
  const input = claimInput(state, t.current());
  assert.equal(
    input.passages.reduce((sum, p) => sum + p.text.length, 0),
    60000,
  );
  assert.ok(input.passages.every((p) => p.text.length <= 12000));
  assert.ok(input.warnings.some((w) => w.includes('省略17段')));
  assert.equal(
    input.passages[0].indexTextSha256,
    createHash('sha256').update(original.extractedText).digest('hex'),
  );
});

test('PDF candidate quotes preserve real page and exact whitespace; edited text hashes invalidate acceptance', () => {
  const t = setup(),
    state = structuredClone(t.h.state()),
    source = state.researchSources[0],
    entry = state.researchIndexes[0];
  source.sourceType = 'pdf';
  source.blob.mime = 'application/pdf';
  entry.contentType = 'pdf_page';
  entry.page = 2;
  entry.extractedText = 'Page two: Alpha  beta.';
  const input = claimInput(state, t.current()),
    candidate = t.candidate();
  candidate.evidence[0].quote = 'Alpha  beta.';
  const grounded = groundCandidates(input, [candidate as any])[0];
  assert.equal(grounded.evidence[0].match!.locator.kind, 'page');
  assert.equal((grounded.evidence[0].match!.locator as any).page, 2);
  candidate.evidence[0].quote = 'Alpha beta.';
  assert.throws(() => groundCandidates(input, [candidate as any]), { code: 'INVALID_CLAIM_QUOTE' });
  entry.extractedText += ' Changed.';
  assert.throws(() => validateClaimInput(state, input), { code: 'CANDIDATE_INPUT_CHANGED' });
});

test('Conflict evidence remains a warning after explicit acceptance and never becomes supported', () => {
  const t = setup(),
    j = t.enqueue(),
    candidate = t.candidate();
  candidate.evidence.push({ ...candidate.evidence[0], role: 'refute', quote: '不是独立测量。' });
  candidate.conflictNote = 'Fixture conflict example only, not real model evidence';
  t.run({ action: 'claim', jobId: j.id, workerId: 'candidate-worker' });
  t.finish(j, [candidate]);
  t.edit('research-candidate-review', {
    jobId: j.id,
    candidateId: candidate.id,
    decision: 'accept',
  });
  assert.equal(t.h.state().researchClaims[0].verificationStatus, 'conflicting');
  assert.deepEqual(
    t.h.state().researchEvidence.map((e) => e.role),
    ['support', 'refute'],
  );
});

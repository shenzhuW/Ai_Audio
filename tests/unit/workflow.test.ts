import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  emptyWorkflow,
  applyWorkflow,
  workflowSnapshot,
} from '../../apps/web/src/server/workflow/engine';
import type { WorkflowCommand } from '../../apps/web/src/domain/workflow';
import { ProjectSchema } from '../../apps/web/src/domain/project';

export function harness() {
  const p = ProjectSchema.parse({
    id: randomUUID(),
    ownerId: 'local-user',
    schemaVersion: 1,
    title: 'Workflow test',
    status: 'draft',
    currentStage: 'brief',
    version: 1,
    targetDurationMs: 30000,
    fps: 30,
    width: 1080,
    height: 1920,
    language: 'zh-CN',
    style: '',
    audience: '',
    budgetLimit: { currency: 'CNY', amount: 50 },
    input: {
      schemaVersion: 1,
      prompt: 'Explain GPU',
      entryType: 'topic',
      voiceMode: 'tts',
      attachments: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  let state = emptyWorkflow();
  const run = (command: WorkflowCommand, key = randomUUID(), now = Date.now()) => {
    const out = applyWorkflow(state, p, command, key, 'local-user', now);
    state = out.state;
    return out.result as any;
  };
  const approve = (r: any) => {
    const submitted = run({ action: 'submit', revisionId: r.id, expectedVersion: r.version });
    return run({ action: 'approve', revisionId: r.id, expectedVersion: submitted.version });
  };
  return { p, run, approve, state: () => state, snapshot: () => workflowSnapshot(state, p) };
}

test('Workflow persists approval truth: draft/edit/submit/approve/fork, immutable old content and history', () => {
  const h = harness();
  let r = h.run({
    action: 'create',
    type: 'research',
    text: 'manual research',
    inputRevisionIds: [],
  });
  r = h.run({ action: 'patch', revisionId: r.id, expectedVersion: 1, text: 'edited research' });
  r = h.approve(r);
  assert.equal(r.status, 'approved');
  assert.throws(
    () =>
      h.run({ action: 'patch', revisionId: r.id, expectedVersion: r.version, text: 'overwrite' }),
    { code: 'IMMUTABLE_REVISION' },
  );
  const fork = h.run({ action: 'fork', revisionId: r.id, expectedVersion: r.version });
  assert.equal(fork.parentRevisionId, r.id);
  assert.equal(fork.revisionNumber, 2);
  assert.equal(h.state().revisions.find((x) => x.id === r.id)?.text, 'edited research');
  assert.equal(h.state().approvals.length, 2);
  assert.ok(h.state().audit.length >= 5);
});

test('Workflow rejects stale approvals; identical retries reuse exact response and one durable downstream job', () => {
  const h = harness();
  const a = h.run({ action: 'create', type: 'research', text: 'v1', inputRevisionIds: [] });
  const aReview = h.run({ action: 'submit', revisionId: a.id, expectedVersion: a.version });
  const b = h.run({ action: 'fork', revisionId: aReview.id, expectedVersion: aReview.version });
  const bReview = h.run({ action: 'submit', revisionId: b.id, expectedVersion: b.version });
  assert.throws(
    () => h.run({ action: 'approve', revisionId: a.id, expectedVersion: aReview.version }),
    { code: 'REVISION_CONFLICT' },
  );
  const command = {
    action: 'approve',
    revisionId: b.id,
    expectedVersion: bReview.version,
  } as const;
  const first = h.run(command, 'same-request');
  assert.deepEqual(h.run(command, 'same-request'), first);
  assert.equal(h.state().jobs.length, 1);
  assert.equal(h.state().outbox.length, 1);
  assert.throws(() => h.run({ ...command, expectedVersion: 99 }, 'same-request'), {
    code: 'IDEMPOTENCY_CONFLICT',
  });
  assert.throws(() => h.run(command), { code: 'REVISION_CONFLICT' });
});

test('Rejected revisions fork for editing; upstream replacement derives transitive stale without rewriting approved status', () => {
  const h = harness();
  const research = h.approve(
    h.run({ action: 'create', type: 'research', text: 'basis', inputRevisionIds: [] }),
  );
  let script = h.run({
    action: 'create',
    type: 'script',
    text: 'script',
    inputRevisionIds: [research.id],
  });
  script = h.run({ action: 'submit', revisionId: script.id, expectedVersion: script.version });
  script = h.run({
    action: 'reject',
    revisionId: script.id,
    expectedVersion: script.version,
    comment: 'clarify wording',
  });
  assert.equal(script.status, 'rejected');
  script = h.approve(
    h.run({ action: 'fork', revisionId: script.id, expectedVersion: script.version }),
  );
  const voice = h.approve(
    h.run({
      action: 'create',
      type: 'voice',
      text: 'test timing description',
      inputRevisionIds: [script.id],
    }),
  );
  assert.throws(
    () =>
      h.run({
        action: 'fork',
        revisionId: research.id,
        expectedVersion: research.version,
        inputRevisionIds: [script.id],
      }),
    { code: 'DEPENDENCY_CYCLE' },
  );
  h.approve(h.run({ action: 'fork', revisionId: research.id, expectedVersion: research.version }));
  const snapshot = h.snapshot();
  assert.ok(snapshot.staleRevisionIds.includes(script.id));
  assert.ok(snapshot.staleRevisionIds.includes(voice.id));
  const queued = h
    .state()
    .jobs.find((j) => j.kind === 'script' && j.inputRevisionIds.includes(research.id))!;
  const blocked = h.run({ action: 'claim', jobId: queued.id, workerId: 'late-worker' });
  assert.equal(blocked.state, 'failed');
  assert.equal(blocked.errorCode, 'STALE_INPUT');
  assert.equal(h.state().revisions.find((r) => r.id === script.id)?.status, 'approved');
  const draft = h.run({ action: 'fork', revisionId: voice.id, expectedVersion: voice.version });
  assert.throws(
    () => h.run({ action: 'submit', revisionId: draft.id, expectedVersion: draft.version }),
    { code: 'STALE_INPUT' },
  );
});

test('Mock jobs have durable claim/finish, cancellation fencing, bounded retries and expired lease recovery', () => {
  const h = harness();
  let j = h.run({ action: 'enqueue', kind: 'research', inputRevisionIds: [] }, 'root-job');
  assert.deepEqual(
    h.run({ action: 'enqueue', kind: 'research', inputRevisionIds: [] }, 'root-job'),
    j,
  );
  j = h.run({ action: 'claim', jobId: j.id, workerId: 'worker-a' });
  assert.equal(j.state, 'running');
  const done = h.run({
    action: 'finish',
    jobId: j.id,
    workerId: 'worker-a',
    text: '模拟研究资料（未核实）',
  });
  assert.equal(done.state, 'succeeded');
  assert.equal(h.state().revisions.find((r) => r.id === done.resultRevisionId)?.mock, true);
  assert.equal(h.state().revisions[0].status, 'draft');
  const mockRevision = h.state().revisions.find((r) => r.id === done.resultRevisionId)!;
  const editedMock = h.run({
    action: 'patch',
    revisionId: mockRevision.id,
    expectedVersion: mockRevision.version,
    text: '用户编辑模拟内容',
  });
  assert.equal(editedMock.mock, true);
  assert.equal(
    h.run({ action: 'fork', revisionId: editedMock.id, expectedVersion: editedMock.version }).mock,
    true,
  );
  let cancelled = h.run({ action: 'enqueue', kind: 'research', inputRevisionIds: [] });
  cancelled = h.run({ action: 'claim', jobId: cancelled.id, workerId: 'worker-b' });
  h.run({ action: 'cancel', jobId: cancelled.id, expectedVersion: cancelled.version });
  assert.throws(
    () =>
      h.run({ action: 'finish', jobId: cancelled.id, workerId: 'worker-b', text: 'late result' }),
    { code: 'JOB_CONFLICT' },
  );
  let failed = h.run({ action: 'enqueue', kind: 'research', inputRevisionIds: [] });
  for (let attempt = 1; attempt <= 3; attempt++) {
    failed = h.run({ action: 'claim', jobId: failed.id, workerId: 'worker-c' });
    failed = h.run({
      action: 'finish',
      jobId: failed.id,
      workerId: 'worker-c',
      errorCode: 'MOCK_FAILURE',
    });
    if (attempt < 3)
      failed = h.run({ action: 'retry', jobId: failed.id, expectedVersion: failed.version });
  }
  assert.equal(failed.attempts.length, 3);
  assert.throws(
    () => h.run({ action: 'retry', jobId: failed.id, expectedVersion: failed.version }),
    { code: 'RETRY_LIMIT' },
  );
  let lost = h.run({ action: 'enqueue', kind: 'research', inputRevisionIds: [] });
  const now = Date.now();
  lost = h.run({ action: 'claim', jobId: lost.id, workerId: 'lost-worker' }, randomUUID(), now);
  lost = h.run({ action: 'recover', jobId: lost.id }, randomUUID(), now + 60000);
  assert.equal(lost.errorCode, 'WORKER_INTERRUPTED');
});

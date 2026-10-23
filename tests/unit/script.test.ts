import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
import { createScriptService } from '../../apps/web/src/server/script/service';
import { estimateScript, scriptDiff, ScriptSegmentSchema } from '../../apps/web/src/domain/script';
const setup = () => {
  const h = harness();
  const run = (c: any, key = randomUUID()) => h.run(c, key);
  const current = () =>
    h
      .state()
      .revisions.find(
        (r) =>
          r.artifactId === h.state().artifacts.find((a) => a.type === 'script')?.id &&
          r.id === h.state().artifacts.find((a) => a.type === 'script')?.currentRevisionId,
      )!;
  const rows = () =>
    (h.state() as any).scriptSegments
      .filter((x: any) => x.revisionId === current().id && !x.removed)
      .sort((a: any, b: any) => a.value.order - b.value.order);
  const segments = () => rows().map((x: any) => ({ id: x.segmentId, ...x.value }));
  const save = (xs: any[], extra = {}) =>
    run({
      action: 'script-save',
      revisionId: current().id,
      expectedVersion: current().version,
      segments: xs,
      unitsPerMinute: 240,
      ...extra,
    });
  return { h, run, current, rows, segments, save };
};
test('Script timing is a transparent mixed-language estimate and diff follows stable IDs', () => {
  const a = ScriptSegmentSchema.parse({ id: randomUUID(), text: '你好 GPU 2', pauseMs: 300 }),
    b = ScriptSegmentSchema.parse({ id: randomUUID(), text: 'GPU costs 32', pauseMs: 0 });
  const estimate = estimateScript([a, b], 240, 10000);
  assert.equal(estimate.details[0].units, 4);
  assert.equal(estimate.details[0].estDurationMs, 1300);
  assert.equal(estimate.details[1].units, 3);
  assert.equal(estimate.differenceMs, -7950);
  assert.equal(estimateScript([{ ...a, text: '' }], 240, 10000).estDurationMs, 0);
  const diff = scriptDiff([a, b], [{ ...b, text: 'Changed explanation' }, a]);
  assert.ok(diff.find((x) => x.segmentId === b.id)!.changes.includes('text'));
  assert.ok(diff.find((x) => x.segmentId === a.id)!.changes.includes('order'));
  assert.ok(scriptDiff([a], [b]).some((x) => x.changes.includes('removed')));
});
test('Empty scripts cannot submit; partial AI output cannot overwrite another segment', () => {
  const t = setup();
  t.run({ action: 'script-start', origin: 'user_provided', text: '' });
  assert.throws(
    () =>
      t.run({ action: 'submit', revisionId: t.current().id, expectedVersion: t.current().version }),
    { code: 'INCOMPLETE_SCRIPT' },
  );
  t.save([
    ScriptSegmentSchema.parse({ id: randomUUID(), text: 'First' }),
    ScriptSegmentSchema.parse({ id: randomUUID(), text: 'Second' }),
  ]);
  const xs = t.segments(),
    job = t.run({
      action: 'script-generate',
      revisionId: t.current().id,
      expectedVersion: t.current().version,
      segmentId: xs[1].id,
      instruction: 'Rewrite',
      mode: 'mock',
    });
  t.run({ action: 'claim', jobId: job.id, workerId: 'bad-result' });
  const finished = t.run({
    action: 'finish',
    jobId: job.id,
    workerId: 'bad-result',
    scriptResult: {
      mode: 'mock',
      segments: [{ ...xs[0], text: 'Wrong target' }],
      notes: 'Invalid test output',
    },
  });
  assert.equal(finished.errorCode, 'INVALID_SCRIPT_RESULT');
  assert.deepEqual(t.segments(), xs);
});

test('Current script workspace reports consumers of earlier approved versions and predicts draft impact', async () => {
  const t = setup();
  t.run({ action: 'script-start', origin: 'user_provided', text: 'First.\n\nSecond.' });
  const xs = t.segments(),
    old = t.h.approve(t.current());
  const consumer = t.run({
    action: 'create',
    type: 'voice',
    text: 'Synthetic segment consumer, no audio',
    inputRevisionIds: [old.id],
    inputSegmentIds: [xs[1].id],
  });
  t.h.approve(consumer);
  t.run({ action: 'fork', revisionId: old.id, expectedVersion: old.version });
  t.save([xs[0], { ...xs[1], text: 'Changed second.' }]);
  const service = createScriptService({
    transaction: async () => ({ state: t.h.state(), project: t.h.p }),
  } as any);
  const draft = await service.read(t.h.p.id, 'local-user');
  assert.ok(
    draft.impact.downstream.some((d) => d.revisionId === consumer.id && d.wouldBeStale && !d.stale),
  );
  t.h.approve(t.current());
  const next = await service.read(t.h.p.id, 'local-user');
  assert.ok(next.impact.downstream.some((d) => d.revisionId === consumer.id && d.stale));
});
test('Structured script imports without research, keeps logical IDs through edit/order/delete and protects 409/idempotency', () => {
  const t = setup();
  t.run({
    action: 'script-start',
    origin: 'user_provided',
    text: '开场为什么值得关注？\n\n第二段解释逻辑。',
  });
  const xs = t.segments();
  assert.equal(xs.length, 2);
  const old = t.current().version;
  const command = {
    action: 'script-save',
    revisionId: t.current().id,
    expectedVersion: old,
    unitsPerMinute: 240,
    segments: [{ ...xs[1], text: '第二段保存后的解释。' }, xs[0]],
  };
  const key = randomUUID(),
    a = t.run(command, key);
  assert.deepEqual(t.run(command, key), a);
  assert.deepEqual(
    t.segments().map((x: any) => x.id),
    [xs[1].id, xs[0].id],
  );
  assert.throws(() => t.run({ ...command, expectedVersion: old }), { code: 'REVISION_CONFLICT' });
  t.save([t.segments()[0]]);
  assert.equal(t.segments().length, 1);
  assert.equal(t.rows()[0].segmentId, xs[1].id);
  assert.equal((t.h.state() as any).scriptSegments.filter((x: any) => x.removed).length, 1);
  assert.throws(
    () =>
      t.run({
        action: 'patch',
        revisionId: t.current().id,
        expectedVersion: t.current().version,
        text: 'bypass structured data',
      }),
    { code: 'STRUCTURED_SCRIPT_REQUIRED' },
  );
});
test('Script binds only approved research and coherent Claim/Source; warnings never assert verified facts', () => {
  const t = setup();
  let r = t.run({
    action: 'create',
    type: 'research',
    text: 'Synthetic research',
    inputRevisionIds: [],
  });
  assert.throws(
    () =>
      t.run({
        action: 'script-start',
        origin: 'research',
        researchRevisionId: r.id,
        text: 'draft',
      }),
    { code: 'STALE_INPUT' },
  );
  const edit = (c: any) =>
    t.run({
      ...c,
      revisionId: r.id,
      expectedVersion: t.h.state().revisions.find((x) => x.id === r.id)!.version,
    });
  const source = edit({
    action: 'research-source',
    source: {
      title: 'Synthetic source',
      sourceType: 'text',
      publisher: 'Fixture',
      creator: 'Fixture',
      publishedAt: null,
      knownRestrictions: 'unknown',
      licenseStatus: 'unknown',
      blob: {
        id: randomUUID(),
        name: 'test.txt',
        mime: 'text/plain',
        sizeBytes: 20,
        sha256: 'a'.repeat(64),
      },
    },
  });
  const claim = edit({
    action: 'research-claim',
    claim: {
      text: 'Synthetic unverified value',
      asOf: null,
      scope: 'fixture',
      unit: 'units',
      caveats: 'not verified',
      verificationStatus: 'unverified',
    },
  });
  edit({
    action: 'research-evidence',
    claimId: claim.id,
    sourceId: source.id,
    role: 'support',
    quote: 'Synthetic value',
    locator: { kind: 'text', label: 'fixture' },
  });
  r = t.h.approve(t.h.state().revisions.find((x) => x.id === r.id)!);
  t.run({
    action: 'script-start',
    origin: 'research',
    researchRevisionId: r.id,
    text: '开场。\n\n有待核验的资料。',
  });
  const xs = t.segments();
  xs[1].factBindings = [{ claimId: claim.id, sourceIds: [source.id] }];
  t.save(xs);
  assert.equal(t.segments()[1].factBindings[0].claimId, claim.id);
  assert.throws(
    () =>
      t.save([
        { ...xs[0], factBindings: [{ claimId: randomUUID(), sourceIds: [source.id] }] },
        xs[1],
      ]),
    { code: 'INVALID_SCRIPT_REFERENCE' },
  );
  assert.throws(
    () =>
      t.save([
        { ...xs[0], factBindings: [{ claimId: claim.id, sourceIds: [randomUUID()] }] },
        xs[1],
      ]),
    { code: 'INVALID_SCRIPT_REFERENCE' },
  );
});
test('Approved script forks stable segments, computes diff and invalidates only declared changed segment dependencies', () => {
  const t = setup();
  t.run({ action: 'script-start', origin: 'user_provided', text: '第一段。\n\n第二段。' });
  const xs = t.segments(),
    approved = t.h.approve(t.current());
  const frozen = structuredClone((t.h.state() as any).scriptSegments);
  assert.throws(() => t.save(xs), { code: 'IMMUTABLE_REVISION' });
  const voice = t.run({
    action: 'create',
    type: 'voice',
    text: 'logical consumer of second segment',
    inputRevisionIds: [approved.id],
    inputSegmentIds: [xs[1].id],
  });
  t.h.approve(voice);
  const story = t.run({
    action: 'create',
    type: 'storyboard',
    text: 'logical consumer of first segment',
    inputRevisionIds: [approved.id],
    inputSegmentIds: [xs[0].id],
  });
  t.h.approve(story);
  t.run({ action: 'fork', revisionId: approved.id, expectedVersion: approved.version });
  assert.deepEqual(
    t.segments().map((x: any) => x.id),
    xs.map((x: any) => x.id),
  );
  t.save([xs[0], { ...xs[1], text: '第二段改动。' }]);
  t.h.approve(t.current());
  const stale = t.h.snapshot().staleRevisionIds;
  assert.ok(stale.includes(voice.id));
  assert.ok(!stale.includes(story.id));
  assert.deepEqual(
    (t.h.state() as any).scriptSegments.filter((x: any) => x.revisionId === approved.id),
    frozen,
  );
});
test('Script generation freezes whole/partial inputs, records explicit Mock and fences late results', async () => {
  const t = setup();
  t.run({ action: 'script-start', origin: 'user_provided', text: '第一段。\n\n第二段。' });
  const xs = t.segments();
  const job = t.run({
    action: 'script-generate',
    revisionId: t.current().id,
    expectedVersion: t.current().version,
    segmentId: xs[1].id,
    instruction: '使因果更清晰',
    mode: 'mock',
  });
  assert.equal(job.provider, 'script');
  assert.equal(job.scriptInput.segmentId, xs[1].id);
  const { MockScriptProvider } = require('../../apps/web/src/server/script/providers');
  const result = await new MockScriptProvider().rewrite(job.scriptInput);
  t.run({ action: 'claim', jobId: job.id, workerId: 'script-unit' });
  t.run({ action: 'finish', jobId: job.id, workerId: 'script-unit', scriptResult: result });
  assert.equal(t.segments()[0].text, xs[0].text);
  assert.equal(t.segments()[1].id, xs[1].id);
  assert.equal(t.current().mock, true);
  const late = t.run({
    action: 'script-generate',
    revisionId: t.current().id,
    expectedVersion: t.current().version,
    instruction: 'rewrite',
    mode: 'mock',
  });
  t.run({ action: 'claim', jobId: late.id, workerId: 'late' });
  t.save(t.segments());
  const output = await new MockScriptProvider().generate(late.scriptInput);
  const finished = t.run({
    action: 'finish',
    jobId: late.id,
    workerId: 'late',
    scriptResult: output,
  });
  assert.equal(finished.errorCode, 'TARGET_CHANGED');
});

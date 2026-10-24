import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
function setup() {
  const h = harness();
  h.p.targetDurationMs = 120000;
  const run = (c: any, key?: string) => h.run(c, key);
  const script = h.approve(
    run({ action: 'script-start', origin: 'user_provided', text: '第一段测试。\n\n第二段解释。' }),
  );
  let v = run({ action: 'voice-start', scriptRevisionId: script.id, mode: 'none' });
  const doc = h.state().voiceTimelines[0];
  v = run({
    action: 'voice-save',
    revisionId: v.id,
    expectedVersion: v.version,
    durationMs: 120000,
    cues: h.state().voiceCues.map((c) => c.value),
    subtitles: h.state().subtitleTracks[0].cues,
    alignmentConfirmed: true,
  });
  const voice = h.approve(v);
  const director = run({
    action: 'director-start',
    scriptRevisionId: script.id,
    voiceRevisionId: voice.id,
  });
  const rev = () => h.state().revisions.find((r) => r.id === director.id)!;
  const segments = h
    .state()
    .scriptSegments.filter((s) => s.revisionId === script.id)
    .map((s) => s.segmentId);
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      shotId: randomUUID(),
      title: `镜头${i + 1}`,
      narrativeGoal: '解释同一对象的因果关系',
      viewerTakeaway: '理解主线',
      scriptSegmentIds: [segments[i % segments.length]],
      voiceCueAnchorIds: [],
      startFrame: (i * 3600) / n,
      durationFrames: 3600 / n,
      endFrame: ((i + 1) * 3600) / n,
      visualType: 'diagram',
      route: 'code',
      composition: '主对象居中，保留字幕区',
      layers: [{ role: 'content', kind: 'graphic', label: '解释对象', depth: 1 }],
      transition: { type: 'cut', durationFrames: 0, continuity: '保持解释对象' },
      animation: { mechanism: 'parallax25d', reason: '通过层级解释关系' },
      visualSearchIntent: { query: '', subject: '', action: '', composition: '', format: 'none' },
      media: null,
      claimIds: [],
      sourceIds: [],
      risks: ['未核实用户文稿'],
    }));
  const save = (shots: any[], version = rev().version, key?: string) =>
    run({ action: 'director-save', revisionId: director.id, expectedVersion: version, shots }, key);
  return { h, run, script, voice, director, rev, make, save, segments };
}
test('Director uses approved confirmed Voice as a 3600-frame timebase; silent planning never invents voice anchors', () => {
  const t = setup();
  const d = (t.h.state() as any).directorDocuments[0];
  assert.equal(d.totalFrames, 3600);
  assert.equal(d.voiceRevisionId, t.voice.id);
  assert.equal(d.scriptRevisionId, t.script.id);
  const shots = t.make(6);
  t.save(shots);
  assert.equal((t.h.state() as any).directorShots.length, 6);
  assert.ok(
    (t.h.state() as any).directorShots.every((s: any) => s.value.voiceCueAnchorIds.length === 0),
  );
});
test('Shot duration/order edits reflow exactly; gaps, overlaps, bounds and unknown references are rejected', () => {
  const t = setup(),
    xs = t.make(6);
  t.save(xs);
  const reordered = [xs[2], xs[0], xs[1], ...xs.slice(3)].map((x, i) => ({
    ...x,
    startFrame: i * 600,
    endFrame: (i + 1) * 600,
  }));
  t.save(reordered);
  assert.equal(
    (t.h.state() as any).directorShots.find((s: any) => s.shotId === xs[2].shotId).value.startFrame,
    0,
  );
  for (const patch of [
    { startFrame: 1 },
    { durationFrames: -1 },
    { endFrame: 3601 },
    { scriptSegmentIds: [randomUUID()] },
    { voiceCueAnchorIds: [randomUUID()] },
  ])
    assert.throws(() => t.save([{ ...reordered[0], ...patch }, ...reordered.slice(1)]));
  const shorter = reordered.map((x, i) => ({
    ...x,
    durationFrames: i === 0 ? 300 : 600,
    startFrame: i === 0 ? 0 : i * 600 - 300,
    endFrame: (i + 1) * 600 - 300,
  }));
  t.save(shorter);
  assert.throws(() => t.h.approve(t.rev()), { code: 'DIRECTOR_INCOMPLETE' });
});
test('Director enforces explicit pending/code routes and current source allow-list without commercial licensing gate', () => {
  const t = setup(),
    xs = t.make(6);
  xs[0].route = 'pending';
  assert.throws(() => t.save(xs), { code: 'VISUAL_PLAN_REQUIRED' });
  xs[0].visualSearchIntent = {
    query: '自制芯片图解',
    subject: '芯片',
    action: '数据并行',
    composition: '中央留字',
    format: 'image',
  };
  t.save(xs);
  assert.throws(
    () =>
      t.save(
        xs.map((x, i) =>
          i
            ? x
            : {
                ...x,
                route: 'bound',
                media: {
                  sourceId: randomUUID(),
                  sourceInMs: null,
                  sourceOutMs: null,
                  playback: 'once',
                },
              },
        ),
      ),
    { code: 'DIRECTOR_SOURCE_INVALID' },
  );
});
test('Director approval/Fork keeps shot identities and immutable history; new voice approval invalidates director', () => {
  const t = setup(),
    xs = t.make(6);
  t.save(xs);
  const approved = t.h.approve(t.rev());
  assert.throws(() => t.save(xs), { code: 'IMMUTABLE_REVISION' });
  const fork = t.run({
    action: 'fork',
    revisionId: approved.id,
    expectedVersion: approved.version,
  });
  assert.deepEqual(
    (t.h.state() as any).directorShots
      .filter((r: any) => r.revisionId === fork.id)
      .map((r: any) => r.shotId),
    xs.map((x) => x.shotId),
  );
  const vf = t.run({ action: 'fork', revisionId: t.voice.id, expectedVersion: t.voice.version });
  t.h.approve(vf);
  assert.ok(t.h.snapshot().staleRevisionIds.includes(approved.id));
});
import { directorFrames, reflowShots, shotTime } from '../../apps/web/src/domain/director';
import { MockDirectorProvider } from '../../apps/web/src/server/director/providers';

test('Director rounds once with a half-open frame interval; edits preserve exact integer coverage', () => {
  assert.equal(directorFrames(120001, 30), 3601);
  assert.equal(directorFrames(1001, 30), 31);
  const t = setup(),
    xs = t.make(6);
  xs[0].durationFrames = 599;
  xs[5].durationFrames = 601;
  const flow = reflowShots(xs as any);
  assert.equal(flow.at(-1)!.endFrame, 3600);
  assert.equal(flow[1].startFrame, 599);
  assert.equal(
    shotTime({ ...flow[0], endFrame: 3601 }, { fps: 30, durationMs: 120001 }).endMs,
    120001,
  );
});
test('Director freezes exact approved input; cancelled and late results cannot write shots', async () => {
  const t = setup();
  let j = t.run({
    action: 'director-generate',
    revisionId: t.rev().id,
    expectedVersion: t.rev().version,
    mode: 'mock',
    shotCount: 6,
    instruction: '明确的Mock测试',
  });
  assert.equal(j.directorInput.document.scriptRevisionId, t.script.id);
  assert.equal(j.directorInput.document.voiceRevisionId, t.voice.id);
  j = t.run({ action: 'claim', jobId: j.id, workerId: 'test-director' });
  const result = await new MockDirectorProvider().generate(j.directorInput);
  t.save(t.make(6));
  const before = structuredClone(t.h.state().directorShots);
  j = t.run({ action: 'finish', jobId: j.id, workerId: 'test-director', directorResult: result });
  assert.equal(j.errorCode, 'TARGET_CHANGED');
  assert.deepEqual(t.h.state().directorShots, before);
  let c = t.run({
    action: 'director-generate',
    revisionId: t.rev().id,
    expectedVersion: t.rev().version,
    mode: 'mock',
    shotCount: 6,
    instruction: '取消测试',
  });
  c = t.run({ action: 'claim', jobId: c.id, workerId: 'test-director' });
  t.run({ action: 'cancel', jobId: c.id, expectedVersion: c.version });
  assert.throws(
    () =>
      t.run({ action: 'finish', jobId: c.id, workerId: 'test-director', directorResult: result }),
    { code: 'JOB_CONFLICT' },
  );
});
test('Director rejects wrong result identity, oversized transition and fake Claim without partial mutation', async () => {
  const t = setup();
  let j = t.run({
    action: 'director-generate',
    revisionId: t.rev().id,
    expectedVersion: t.rev().version,
    mode: 'mock',
    shotCount: 6,
    instruction: '结构测试',
  });
  j = t.run({ action: 'claim', jobId: j.id, workerId: 'test' });
  const result = await new MockDirectorProvider().generate(j.directorInput);
  result.shots[0].shotId = randomUUID();
  j = t.run({ action: 'finish', jobId: j.id, workerId: 'test', directorResult: result });
  assert.equal(j.errorCode, 'INVALID_DIRECTOR_RESULT');
  assert.equal(t.h.state().directorShots.length, 0);
  const xs = t.make(6);
  xs[0].transition.durationFrames = 600;
  assert.throws(() => t.save(xs), { code: 'DIRECTOR_TIMELINE' });
  xs[0].transition.durationFrames = 0;
  xs[0].claimIds = [randomUUID()];
  assert.throws(() => t.save(xs), { code: 'DIRECTOR_CLAIM_INVALID' });
});
import {
  directorTimingWarnings,
  assertDirectorSubmittable,
} from '../../apps/web/src/server/director/engine';
test('A shot must reference every spoken segment in its time range, while genuine silent pauses are allowed', () => {
  const t = setup(),
    state = t.h.state(),
    voice = state.voiceTimelines.find((v) => v.revisionId === t.voice.id)!;
  voice.mode = 'import';
  const rows = state.voiceCues.filter((r) => r.revisionId === t.voice.id);
  rows.forEach((r, i) => {
    r.value.startMs = i ? 1000 : 0;
    r.value.endMs = i ? 120000 : 1000;
    r.value.alignment = 'manual';
  });
  const shot = { ...t.make(1)[0], scriptSegmentIds: [t.segments[0]] };
  const doc = state.directorDocuments[0];
  assert.ok(
    directorTimingWarnings(state, doc, [shot as any]).length > 0,
    '119 seconds of omitted narration must be reported',
  );
});
test('Director Job lease recovery, retries and idempotency fence old workers', async () => {
  const t = setup(),
    now = Date.now();
  const request = {
    action: 'director-generate',
    revisionId: t.rev().id,
    expectedVersion: t.rev().version,
    mode: 'mock',
    shotCount: 6,
    instruction: '租约/重试测试',
  };
  const job = t.run(request, 'director-once');
  assert.deepEqual(t.run(request, 'director-once'), job);
  assert.equal(t.h.state().jobs.filter((j) => j.provider === 'director').length, 1);
  const first = t.h.run({ action: 'claim', jobId: job.id, workerId: 'old' }, randomUUID(), now);
  const output = await new MockDirectorProvider().generate(first.directorInput);
  const recovered = t.h.run({ action: 'recover', jobId: job.id }, randomUUID(), now + 31000);
  assert.equal(recovered.errorCode, 'WORKER_INTERRUPTED');
  assert.equal(recovered.leaseOwner, null);
  const retry = t.h.run(
    { action: 'retry', jobId: job.id, expectedVersion: recovered.version },
    randomUUID(),
    now + 32000,
  );
  const second = t.h.run(
    { action: 'claim', jobId: job.id, workerId: 'new' },
    randomUUID(),
    now + 32000,
  );
  assert.equal(second.attempt, 2);
  assert.throws(
    () =>
      t.h.run(
        { action: 'finish', jobId: job.id, workerId: 'old', directorResult: output },
        randomUUID(),
        now + 33000,
      ),
    { code: 'JOB_CONFLICT' },
  );
  const finished = t.h.run(
    { action: 'finish', jobId: job.id, workerId: 'new', directorResult: output },
    randomUUID(),
    now + 33000,
  );
  assert.equal(finished.state, 'succeeded');
  assert.equal(finished.attempts[0].state, 'failed');
  assert.equal(t.h.state().directorShots.length, 6);
});
import { createDirectorService } from '../../apps/web/src/server/director/service';
test('Director history diff exposes the exact before/after shot data, not only changed IDs', async () => {
  const t = setup(),
    shots = t.make(6);
  t.save(shots);
  const approved = t.h.approve(t.rev());
  const fork = t.run({
    action: 'fork',
    revisionId: approved.id,
    expectedVersion: approved.version,
  });
  t.run({
    action: 'director-save',
    revisionId: fork.id,
    expectedVersion: fork.version,
    shots: shots.map((s, i) => (i ? s : { ...s, title: '新的镜头标题' })),
  });
  const repo = { transaction: async () => ({ state: t.h.state(), project: t.h.p }) } as any;
  const w = await createDirectorService(repo).read(t.h.p.id, 'local-user');
  const changes = (w.diff as any).changes;
  assert.equal(changes.length, 1);
  assert.equal(changes[0].before.title, shots[0].title);
  assert.equal(changes[0].after.title, '新的镜头标题');
  assert.equal(changes[0].shotId, shots[0].shotId);
});

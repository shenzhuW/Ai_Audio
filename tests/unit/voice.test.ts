import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';

function setup(mode: 'tts' | 'import' | 'none' = 'none') {
  const h = harness(),
    run = (c: any, key = randomUUID()) => h.run(c, key);
  const sr = run({
    action: 'script-start',
    origin: 'user_provided',
    text: '测试，测试。这是第一段。\n\n第二段保留来源关系。',
  });
  const approved = h.approve(sr);
  const voice = run({ action: 'voice-start', scriptRevisionId: approved.id, mode });
  const doc = () => h.state().voiceTimelines.find((x: any) => x.revisionId === voice.id)!;
  const revision = () => h.state().revisions.find((x) => x.id === voice.id)!;
  const cues = () =>
    h
      .state()
      .voiceCues.filter((x: any) => x.revisionId === voice.id)
      .map((x: any) => x.value);
  const subs = () => h.state().subtitleTracks.find((x: any) => x.revisionId === voice.id)!.cues;
  const save = (body = {}, key = randomUUID()) =>
    run(
      {
        action: 'voice-save',
        revisionId: voice.id,
        expectedVersion: revision().version,
        durationMs: doc().durationMs,
        cues: cues(),
        subtitles: subs(),
        alignmentConfirmed: true,
        ...body,
      },
      key,
    );
  return { h, run, voice, doc, revision, cues, subs, save, approved };
}

test('Silent duration obeys configured resource limits instead of bypassing project duration bounds', () => {
  const t = setup();
  assert.throws(() => t.save({ durationMs: 3600001 }), { code: 'VOICE_DURATION_LIMIT' });
});

test('Ordinary saves cannot invent forced alignment provenance', () => {
  const t = setup('import');
  assert.throws(
    () =>
      t.save({
        alignmentConfirmed: false,
        cues: t.cues().map((c) => ({ ...c, alignment: 'forced', alignmentRunId: randomUUID() })),
      }),
    { code: 'ALIGNMENT_PROVENANCE' },
  );
});

test('Legacy text voice drafts convert only by explicit current revision/version and preserve their identity', () => {
  const h = harness();
  const script = h.approve(
    h.run({ action: 'script-start', origin: 'user_provided', text: '旧项目文稿。' }),
  );
  const legacy = h.run({
    action: 'create',
    type: 'voice',
    text: '旧版配音备注',
    inputRevisionIds: [script.id],
  });
  assert.throws(() => h.run({ action: 'voice-start', scriptRevisionId: script.id, mode: 'none' }), {
    code: 'REVISION_CONFLICT',
  });
  const converted = h.run({
    action: 'voice-start',
    scriptRevisionId: script.id,
    mode: 'none',
    legacyRevisionId: legacy.id,
    expectedVersion: legacy.version,
  });
  assert.equal(converted.id, legacy.id);
  assert.equal(h.state().voiceTimelines[0].revisionId, legacy.id);
  assert.equal(h.state().voiceTimelines[0].audio, null);
});

test('All voice modes persist explicit timelines fixed to current approved script; silent mode never creates audio', () => {
  for (const mode of ['tts', 'import', 'none'] as const) {
    const t = setup(mode);
    assert.equal(t.doc().mode, mode);
    assert.equal(t.doc().scriptRevisionId, t.approved.id);
    assert.equal(t.doc().audio, null);
    assert.equal(t.doc().durationMs, t.h.p.targetDurationMs);
    assert.equal(t.cues().length, 3);
    assert.equal(t.subs().length, 3);
    assert.ok(
      t
        .cues()
        .every(
          (c: any) =>
            c.alignment === (mode === 'none' ? 'planned' : 'estimated') && c.confidence === null,
        ),
    );
    const anchors = t.cues().map((x: any) => x.anchorId);
    const newSubs = t
      .subs()
      .map((s: any, i: number) => (i ? s : { ...s, text: '修改字幕，不修改文稿' }));
    t.save({ subtitles: newSubs });
    assert.deepEqual(
      t.cues().map((x: any) => x.anchorId),
      anchors,
    );
    assert.equal(t.h.state().scriptSegments[0].value.text, '测试，测试。这是第一段。');
    if (mode !== 'none')
      assert.throws(() => t.h.approve(t.revision()), { code: 'VOICE_AUDIO_REQUIRED' });
  }
});

test('Cue mappings distinguish repeated words by offsets, retain anchor identity, and validate same-level overlap and time bounds', () => {
  const t = setup(),
    base = t.cues()[0];
  const a = {
    ...base,
    id: randomUUID(),
    anchorId: randomUUID(),
    level: 'word',
    startChar: 0,
    endChar: 2,
    text: '测试',
    startMs: 0,
    endMs: 1000,
    alignment: 'manual',
    stale: false,
  };
  const b = {
    ...a,
    id: randomUUID(),
    anchorId: randomUUID(),
    startChar: 3,
    endChar: 5,
    startMs: 1000,
    endMs: 2000,
  };
  t.save({ cues: [...t.cues(), { ...a, alignment: 'planned' }, { ...b, alignment: 'planned' }] });
  assert.notEqual(a.anchorId, b.anchorId);
  assert.equal(t.cues().find((c: any) => c.anchorId === b.anchorId).startChar, 3);
  for (const invalid of [
    { startMs: -1 },
    { endMs: 0 },
    { endMs: t.doc().durationMs + 1 },
    { startChar: 1 },
    { segmentId: randomUUID() },
    { segmentTextSha256: '0'.repeat(64) },
  ])
    assert.throws(() => t.save({ cues: [{ ...a, alignment: 'planned', ...invalid }] }));
  assert.throws(
    () =>
      t.save({
        cues: [
          { ...a, alignment: 'planned' },
          { ...b, alignment: 'planned', startMs: 999 },
        ],
      }),
    { code: 'VOICE_OVERLAP' },
  );
  assert.throws(() =>
    t.save({
      cues: [
        { ...a, alignment: 'planned' },
        { ...b, alignment: 'planned', anchorId: a.anchorId },
      ],
    }),
  );
  assert.throws(() => t.save({ subtitles: t.subs().map((s: any) => ({ ...s, startMs: 0 })) }), {
    code: 'SUBTITLE_OVERLAP',
  });
});

test('Voice drafts reuse idempotency, 409, approval immutability and stable Fork identity', () => {
  const t = setup();
  const saved = t.save({}, 'voice-save-once');
  assert.equal(t.doc().alignmentConfirmed, true);
  assert.throws(
    () =>
      t.run({
        action: 'voice-save',
        revisionId: t.voice.id,
        expectedVersion: saved.version - 1,
        durationMs: t.doc().durationMs,
        cues: t.cues(),
        subtitles: t.subs(),
        alignmentConfirmed: true,
      }),
    { code: 'REVISION_CONFLICT' },
  );
  const before = structuredClone(t.cues()),
    approved = t.h.approve(t.revision());
  assert.throws(() => t.save(), { code: 'IMMUTABLE_REVISION' });
  assert.throws(
    () =>
      t.run({
        action: 'patch',
        revisionId: approved.id,
        expectedVersion: approved.version,
        text: 'override',
      }),
    { code: 'IMMUTABLE_REVISION' },
  );
  const fork = t.run({
    action: 'fork',
    revisionId: approved.id,
    expectedVersion: approved.version,
  });
  assert.deepEqual(
    t.h
      .state()
      .voiceCues.filter((x: any) => x.revisionId === fork.id)
      .map((x: any) => x.value),
    before,
  );
  assert.ok(
    t.h
      .state()
      .voiceCues.filter((x: any) => x.revisionId === fork.id)
      .every(
        (x: any) =>
          !t.h
            .state()
            .voiceCues.some((old: any) => old.revisionId === approved.id && old.id === x.id),
      ),
  );
});

test('Voice submission/rejection is immutable and Fork restores editable stable anchors', () => {
  const t = setup();
  t.save();
  const submitted = t.run({
    action: 'submit',
    revisionId: t.voice.id,
    expectedVersion: t.revision().version,
  });
  const rejected = t.run({
    action: 'reject',
    revisionId: submitted.id,
    expectedVersion: submitted.version,
    comment: '字幕节奏需修正',
  });
  const before = structuredClone(t.cues());
  assert.throws(() => t.save(), { code: 'IMMUTABLE_REVISION' });
  const next = t.run({
    action: 'fork',
    revisionId: rejected.id,
    expectedVersion: rejected.version,
  });
  assert.equal(next.status, 'draft');
  assert.deepEqual(
    t.h
      .state()
      .voiceCues.filter((c) => c.revisionId === next.id)
      .map((c) => c.value),
    before,
  );
});

test('Replacing approved script invalidates voice dependencies and affected cues without modifying historical snapshots', () => {
  const t = setup();
  t.save();
  const approved = t.h.approve(t.revision()),
    before = JSON.stringify(t.cues());
  const next = t.run({
    action: 'fork',
    revisionId: t.approved.id,
    expectedVersion: t.approved.version,
  });
  const segments = t.h
    .state()
    .scriptSegments.filter((x) => x.revisionId === next.id && !x.removed)
    .map((x) => ({ id: x.segmentId, ...x.value }));
  segments[0].text = '修改第一段，原来的语音需要重新核对。';
  const edited = t.run({
    action: 'script-save',
    revisionId: next.id,
    expectedVersion: next.version,
    segments,
    unitsPerMinute: 240,
  });
  t.h.approve(edited);
  assert.ok(t.h.snapshot().staleRevisionIds.includes(approved.id));
  assert.equal(JSON.stringify(t.cues()), before);
  assert.throws(() =>
    t.run({ action: 'voice-start', scriptRevisionId: t.approved.id, mode: 'none' }),
  );
});

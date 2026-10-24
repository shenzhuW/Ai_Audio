import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
import { recipeHash, validateRange } from '../../apps/web/src/server/assets/recipe';
import { blankShot } from '../../apps/web/src/domain/director';
import { emptyWorkflow } from '../../apps/web/src/server/workflow/engine';
import { finishAsset } from '../../apps/web/src/server/assets/engine';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
function setup() {
  const h = harness(),
    script = h.approve(
      h.run({ action: 'script-start', origin: 'user_provided', text: '解释芯片计算。' }),
    );
  let v = h.run({ action: 'voice-start', scriptRevisionId: script.id, mode: 'none' });
  v = h.run({
    action: 'voice-save',
    revisionId: v.id,
    expectedVersion: v.version,
    durationMs: 30000,
    cues: h.state().voiceCues.map((x) => x.value),
    subtitles: h.state().subtitleTracks[0].cues,
    alignmentConfirmed: true,
  });
  const voice = h.approve(v),
    d = h.run({ action: 'director-start', scriptRevisionId: script.id, voiceRevisionId: voice.id });
  const segment = h.state().scriptSegments[0].segmentId;
  const shots = [0, 1].map((_, i) => ({
    ...blankShot([segment], randomUUID(), 450),
    shotId: randomUUID(),
    startFrame: i * 450,
    durationFrames: 450,
    endFrame: (i + 1) * 450,
    route: 'pending' as const,
    visualType: 'footage' as const,
    visualSearchIntent: {
      query: 'GPU',
      subject: 'GPU',
      action: 'processing',
      composition: 'center',
      format: 'video' as const,
    },
  }));
  const saved = h.run({
    action: 'director-save',
    revisionId: d.id,
    expectedVersion: d.version,
    shots,
  });
  const director = h.approve(saved);
  const blob = {
    key: 'a'.repeat(64),
    sha256: 'a'.repeat(64),
    sizeBytes: 100,
    mime: 'video/mp4' as const,
  };
  const j = h.run({
    action: 'asset-import',
    blob,
    title: 'GPU',
    author: 'self',
    restrictions: 'non-commercial',
    license: 'unknown',
  });
  const source = {
    ...h.state().sourceAssets[0],
    status: 'indexed',
    metadata: {
      kind: 'video',
      width: 640,
      height: 360,
      durationMs: 30000,
      fps: 30,
      codec: 'h264',
      format: 'mov,mp4',
      frames: 900,
    },
    index: {
      version: 1,
      sourceSha256: blob.sha256,
      frames: [{ id: randomUUID(), atMs: 0, blob: { ...blob, mime: 'image/jpeg' } }],
      contactSheet: { ...blob, mime: 'image/jpeg' },
      sceneCutsMs: [],
      sharpness: 1,
      scope: 'sparse_frames',
    },
  };
  h.run({ action: 'claim', jobId: j.id, workerId: 'unit-worker' });
  const output = {
    sources: [source],
    candidates: [],
    prepared: null,
    cacheHit: false,
    searches: [],
    aiRuns: [],
    notes: 'unit fixture, not actual FFprobe',
  };
  h.run({ action: 'finish', jobId: j.id, workerId: 'unit-worker', assetResult: output } as any);
  return { h, director, shots, source, blob };
}

test('Asset ranges reject negative/empty/outside intervals, and short once playback', () => {
  const source = { kind: 'video', durationMs: 12000 };
  for (const [a, b] of [
    [-1, 2000],
    [3000, 3000],
    [0, 12001],
  ])
    assert.throws(() => validateRange(source as any, a, b, 3000, 'once'));
  assert.throws(() => validateRange(source as any, 0, 1000, 3000, 'once'));
  assert.doesNotThrow(() => validateRange(source as any, 0, 1000, 3000, 'loop'));
  assert.doesNotThrow(() =>
    validateRange({ kind: 'image', durationMs: null } as any, 0, 0, 3000, 'once'),
  );
});
test('Recipe hash is canonical and changes for source/range/crop, independent of binding UUID', () => {
  const x = {
    sourceSha256: 'a'.repeat(64),
    sourceInMs: 1000,
    sourceOutMs: 4000,
    width: 1080,
    height: 1920,
    fps: 30,
    frames: 90,
    fit: 'cover',
    x: 0.5,
    y: 0.5,
    playback: 'once',
    mute: true,
  };
  assert.equal(recipeHash(x as any), recipeHash({ ...x } as any));
  for (const patch of [{ sourceInMs: 2000 }, { x: 0.2 }, { sourceSha256: 'b'.repeat(64) }])
    assert.notEqual(recipeHash(x as any), recipeHash({ ...x, ...patch } as any));
});
test('Asset jobs require current approved Director and cannot use arbitrary source IDs', () => {
  const h = harness();
  assert.throws(
    () =>
      h.run({
        action: 'asset-search',
        directorRevisionId: randomUUID(),
        shotId: randomUUID(),
        scope: 'local',
        analysis: 'metadata',
        topK: 2,
      } as any),
    { code: 'STALE_INPUT' },
  );
});
test('Recorded real two-database visual results pass strict frame/source/run mapping; invented frames reject atomically', () => {
  for (const backend of ['sqlite', 'postgresql'])
    for (const name of ['local-visual-match.json', 'external-search-match.json']) {
      const job = JSON.parse(
          readFileSync(resolve(__dirname, '../../docs/evidence/phase07', backend, name), 'utf8'),
        ),
        s = emptyWorkflow();
      s.artifacts.push({
        id: 'unit-artifact',
        type: 'storyboard',
        approvedRevisionId: job.assetInput.directorRevisionId,
      } as any);
      s.revisions.push({
        id: job.assetInput.directorRevisionId,
        artifactId: 'unit-artifact',
        directorSchemaVersion: 1,
        status: 'approved',
      } as any);
      const before = structuredClone(s),
        bad = structuredClone(job.assetResult);
      bad.candidates[0].frameIds[0] = randomUUID();
      assert.equal(finishAsset(s, job.assetInput, bad, new Set()), 'ASSET_RESULT_INVALID');
      assert.deepEqual(s, before);
      assert.equal(finishAsset(s, job.assetInput, job.assetResult, new Set()), null);
      assert.equal(s.candidateClips.length, job.assetResult.candidates.length);
    }
});
test('Two virtual intervals share one original; binding append history, scoped 409 and idempotency preserve Director', () => {
  const { h, director, shots, source, blob } = setup(),
    before = JSON.stringify(h.state().revisions);
  const candidate = (i: number, a: number, b: number) =>
    h.run({
      action: 'asset-candidate',
      directorRevisionId: director.id,
      shotId: shots[i].shotId,
      sourceAssetId: source.id,
      sourceInMs: a,
      sourceOutMs: b,
    });
  const c1 = candidate(0, 0, 15000),
    c2 = candidate(0, 15000, 30000),
    other = candidate(1, 0, 15000);
  assert.equal(c1.sourceAssetId, c2.sourceAssetId);
  assert.equal(h.state().sourceAssets.length, 1);
  assert.equal(h.run({ action: 'asset-import', blob, title: 'duplicate' } as any).id, source.id);
  const bind = (c: any, v: number) =>
    ({
      action: 'asset-bind',
      directorRevisionId: director.id,
      shotId: c.shotId,
      candidateId: c.id,
      expectedBindingVersion: v,
      sourceInMs: c.sourceInMs,
      sourceOutMs: c.sourceOutMs,
      fit: 'cover',
      x: 0.5,
      y: 0.5,
      playback: 'once',
      purpose: 'illustrative',
    }) as const;
  const key = randomUUID(),
    first = h.run(bind(c1, 0), key);
  assert.equal(h.run(bind(c1, 0), key).id, first.id);
  assert.throws(() => h.run(bind(c2, 0)), { code: 'ASSET_BINDING_CONFLICT' });
  const untouched = h.run(bind(other, 0)),
    second = h.run(bind(c2, 1));
  assert.equal(second.previousBindingId, first.id);
  assert.equal(h.state().assetBindings.find((b) => b.id === untouched.id)?.version, 1);
  assert.equal(JSON.stringify(h.state().revisions), before);
  assert.equal(h.state().assetBindings.length, 3);
  assert.equal(h.state().preparedAssets.length, 0);
});
test('Cancelled, expired and replaced binding tasks cannot write late prepared artifacts', () => {
  const { h, director, shots, source } = setup();
  const c = h.run({
    action: 'asset-candidate',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    sourceAssetId: source.id,
    sourceInMs: 0,
    sourceOutMs: 15000,
  });
  const b = h.run({
    action: 'asset-bind',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    candidateId: c.id,
    expectedBindingVersion: 0,
    sourceInMs: 0,
    sourceOutMs: 15000,
  });
  const job = h.run({ action: 'claim', jobId: b.jobId, workerId: 'w' });
  h.run({ action: 'cancel', jobId: job.id, expectedVersion: job.version });
  assert.throws(
    () =>
      h.run({
        action: 'finish',
        jobId: job.id,
        workerId: 'w',
        assetResult: {
          sources: [],
          candidates: [],
          prepared: null,
          cacheHit: false,
          searches: [],
          aiRuns: [],
          notes: '',
        },
      }),
    { code: 'JOB_CONFLICT' },
  );
  const retry = h.run({
    action: 'retry',
    jobId: job.id,
    expectedVersion: h.state().jobs.find((j) => j.id === job.id)!.version,
  });
  h.run({ action: 'claim', jobId: retry.id, workerId: 'w2' });
  h.run({
    action: 'asset-bind',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    candidateId: c.id,
    expectedBindingVersion: 1,
    sourceInMs: 0,
    sourceOutMs: 15000,
  });
  const done = h.run({
    action: 'finish',
    jobId: retry.id,
    workerId: 'w2',
    assetResult: {
      sources: [],
      candidates: [],
      prepared: {
        id: randomUUID(),
        recipeHash: b.recipeHash,
        sourceSha256: source.blob!.sha256,
        recipe: b.recipe,
        producerBindingId: b.id,
        createdAt: new Date().toISOString(),
        blob: { key: 'b'.repeat(64), sha256: 'b'.repeat(64), sizeBytes: 200, mime: 'video/mp4' },
        metadata: {
          kind: 'video',
          width: 1080,
          height: 1920,
          durationMs: 15000,
          fps: 30,
          codec: 'h264',
          format: 'mov,mp4',
          frames: 450,
        },
        log: 'unit fake prepared payload, not real media',
      },
      cacheHit: false,
      searches: [],
      aiRuns: [],
      notes: '',
    },
  });
  assert.equal(done.errorCode, 'ASSET_BINDING_CHANGED');
  assert.equal(h.state().preparedAssets.length, 0);
  const next = h.state().jobs.find((j) => j.provider === 'asset' && j.state === 'queued')!;
  const leased = h.run({ action: 'claim', jobId: next.id, workerId: 'expiry-worker' });
  const expired = Date.parse(leased.leaseExpiresAt) + 1;
  assert.throws(
    () =>
      h.run(
        {
          action: 'finish',
          jobId: next.id,
          workerId: 'expiry-worker',
          errorCode: 'ASSET_MEDIA_FAILED',
        },
        randomUUID(),
        expired,
      ),
    { code: 'JOB_CONFLICT' },
  );
  const recovered = h.run({ action: 'recover', jobId: next.id }, randomUUID(), expired);
  assert.equal(recovered.errorCode, 'WORKER_INTERRUPTED');
});

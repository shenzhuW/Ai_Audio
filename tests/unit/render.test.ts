import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
import {
  SceneSpecSchema,
  RenderInputSchema,
  makePocInput,
  verifyVideoMetadata,
} from '../../apps/web/src/domain/motion';

const assets = { backgroundSha256: 'a'.repeat(64), fontSha256: 'b'.repeat(64) };
const input = () => makePocInput(72, assets, 'c'.repeat(64));
test('SceneSpec freezes frame timeline and declared editable props, rejects unsafe/invalid inputs', () => {
  const i = input();
  assert.equal(i.scene.durationFrames, 300);
  assert.deepEqual(i.scene.resolution, { width: 1080, height: 1920 });
  assert.equal(i.timeline.mode, 'none');
  assert.deepEqual(RenderInputSchema.parse(i), i);
  assert.throws(() => makePocInput(999, assets, 'c'.repeat(64)));
  const invalid = structuredClone(i);
  invalid.timeline.subtitles[0].endFrame = 301;
  assert.throws(() => RenderInputSchema.parse(invalid));
  const badLayer = structuredClone(i.scene);
  badLayer.layers[1].zIndex = -1;
  assert.throws(() => SceneSpecSchema.parse(badLayer));
  assert.throws(() => RenderInputSchema.parse({ ...i, code: 'process.env' }));
  assert.throws(() => RenderInputSchema.parse({ ...i, assetUrl: 'http://169.254.169.254/' }));
  assert.deepEqual(input(), input(), 'same props produce the same frozen fixture');
});
test('FFprobe gate rejects incorrect encoding, frame rate, frame count and dimensions', () => {
  const probe = {
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1080,
        height: 1920,
        avg_frame_rate: '30/1',
        r_frame_rate: '30/1',
        nb_frames: '300',
        duration: '10.000000',
      },
    ],
    format: { duration: '10.000000' },
  };
  assert.equal(verifyVideoMetadata(probe).fps, 30);
  for (const change of [
    { codec_name: 'vp9' },
    { width: 720 },
    { avg_frame_rate: '29/1' },
    { nb_frames: '299' },
    { duration: '9.000' },
  ])
    assert.throws(() =>
      verifyVideoMetadata({ ...probe, streams: [{ ...probe.streams[0], ...change }] }),
    );
});
test('Render jobs reuse workflow idempotency, heartbeat lease fencing, cancellation and failure attempts', () => {
  const h = harness();
  const run = (c: unknown, key = randomUUID(), now = 100000) => h.run(c as any, key, now);
  const command = { action: 'render', input: input() };
  const job = run(command, 'same-render');
  assert.equal(job.provider, 'remotion');
  assert.deepEqual(run(command, 'same-render'), job);
  assert.equal(h.state().jobs.length, 1);
  assert.equal(h.state().outbox.length, 1);
  assert.throws(
    () => run({ action: 'render', input: makePocInput(64, assets, 'c'.repeat(64)) }, 'same-render'),
    { code: 'IDEMPOTENCY_CONFLICT' },
  );
  const running = run({ action: 'claim', jobId: job.id, workerId: 'attempt-one' });
  const beat = run(
    {
      action: 'heartbeat',
      jobId: job.id,
      workerId: 'attempt-one',
      progress: 0.2,
      message: 'Rendering frames',
    },
    'heartbeat-1',
    120000,
  );
  assert.equal(beat.state, 'running');
  assert.equal(
    beat.version,
    running.version,
    'heartbeat must not invalidate a user cancellation version',
  );
  assert.equal(beat.leaseExpiresAt, new Date(150000).toISOString());
  assert.throws(
    () =>
      run(
        { action: 'heartbeat', jobId: job.id, workerId: 'other', progress: 0.3 },
        randomUUID(),
        125000,
      ),
    { code: 'JOB_CONFLICT' },
  );
  assert.throws(() => run({ action: 'recover', jobId: job.id }, randomUUID(), 135000), {
    code: 'JOB_CONFLICT',
  });
  const cancelled = run(
    { action: 'cancel', jobId: job.id, expectedVersion: beat.version },
    randomUUID(),
    130000,
  );
  assert.equal(cancelled.state, 'cancelled');
  assert.throws(
    () =>
      run(
        { action: 'heartbeat', jobId: job.id, workerId: 'attempt-one', progress: 0.9 },
        randomUUID(),
        130001,
      ),
    { code: 'JOB_CONFLICT' },
  );
  const queued = run(
    { action: 'retry', jobId: job.id, expectedVersion: cancelled.version },
    randomUUID(),
    140000,
  );
  assert.deepEqual(queued.renderInput, job.renderInput);
  const second = run(
    { action: 'claim', jobId: job.id, workerId: 'attempt-two' },
    randomUUID(),
    140000,
  );
  assert.throws(
    () =>
      run(
        { action: 'finish', jobId: job.id, workerId: 'attempt-one', errorCode: 'OLD_PROCESS' },
        randomUUID(),
        140001,
      ),
    { code: 'JOB_CONFLICT' },
  );
  const failed = run(
    {
      action: 'finish',
      jobId: job.id,
      workerId: 'attempt-two',
      errorCode: 'RENDER_PROCESS_FAILED',
    },
    randomUUID(),
    140002,
  );
  assert.equal(failed.state, 'failed');
  assert.equal(failed.attempts.length, 2);
  assert.equal(failed.attempts[0].state, 'cancelled');
  assert.equal(failed.errorCode, 'RENDER_PROCESS_FAILED');
  assert.equal(failed.resultRevisionId, null);
  assert.ok(running.leaseOwner && second.leaseOwner);
});

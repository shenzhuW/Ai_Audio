import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from './workflow.test';
test('Real analysis operations freeze actual audio and reject silent/no-audio timelines', () => {
  const h = harness(),
    run = (c: any) => h.run(c),
    script = run({
      action: 'script-start',
      origin: 'user_provided',
      text: '测试，测试。字幕跟随语音。',
    }),
    approved = h.approve(script);
  const voice = run({ action: 'voice-start', scriptRevisionId: approved.id, mode: 'none' });
  for (const operation of ['transcribe', 'align'])
    assert.throws(
      () =>
        run({
          action: 'voice-analyze',
          revisionId: voice.id,
          expectedVersion: voice.version,
          operation,
          provider: 'whisper-local',
        }),
      { code: 'VOICE_AUDIO_REQUIRED' },
    );
  assert.equal(h.state().jobs.filter((j) => j.provider === 'voice').length, 0);
});
test('Unbound ASR subtitles are drafts, not fabricated script-position mappings or approved final input', () => {
  const h = harness(),
    run = (c: any) => h.run(c),
    script = run({ action: 'script-start', origin: 'user_provided', text: '当前文稿。' }),
    approved = h.approve(script),
    r = run({ action: 'voice-start', scriptRevisionId: approved.id, mode: 'none' });
  const doc = (h.state() as any).voiceTimelines[0],
    cues = (h.state() as any).voiceCues.map((c: any) => c.value);
  const saved = run({
    action: 'voice-save',
    revisionId: r.id,
    expectedVersion: r.version,
    durationMs: doc.durationMs,
    cues,
    subtitles: [
      {
        id: randomUUID(),
        segmentId: null,
        anchorId: null,
        text: '模型识别的不同内容',
        startMs: 0,
        endMs: 1000,
      },
    ],
    alignmentConfirmed: true,
  });
  assert.throws(() => h.approve(saved), { code: 'SUBTITLE_BINDING_REQUIRED' });
});

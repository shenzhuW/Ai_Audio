import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Synthetic timing fixtures test conversion only. Actual inference is separately required.
test('Model timing conversion preserves repeated-word offsets and nonuniform acoustic times without averaging', () => {
  const { mapAlignedWords } = require('../../apps/web/src/server/voice/alignment');
  const segmentId = randomUUID(),
    runId = randomUUID(),
    segments = [{ id: segmentId, text: '测试，测试。字幕出现。' }];
  const words = [
    { text: '测试，', startMs: 200, endMs: 850, probability: null },
    { text: '测试。', startMs: 2600, endMs: 3100, probability: null },
    { text: '字幕', startMs: 5000, endMs: 5400, probability: null },
    { text: '出现。', startMs: 5400, endMs: 6000, probability: null },
  ];
  const result = mapAlignedWords(segments, words, 7000, runId),
    repeat = result.cues.filter((c: any) => c.level === 'word' && c.text.includes('测试'));
  assert.deepEqual(
    repeat.map((c: any) => [c.startChar, c.endChar, c.startMs, c.endMs]),
    [
      [0, 3, 200, 850],
      [3, 6, 2600, 3100],
    ],
  );
  assert.ok(result.cues.every((c: any) => c.alignment === 'forced' && c.alignmentRunId === runId));
  assert.equal(result.subtitles[0].startMs, 200);
  assert.equal(result.subtitles[0].endMs, 3100);
  assert.throws(() =>
    mapAlignedWords(segments, [{ ...words[0], text: '不存在的文字' }], 7000, runId),
  );
  assert.throws(() => mapAlignedWords(segments, [{ ...words[0], endMs: 8000 }], 7000, runId));
});

import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../errors';
import type { VoiceCue, SubtitleCue } from '../../domain/voice';
type Word = { text: string; startMs: number; endMs: number; probability: number | null };
// Positions advance through the fixed text, so identical words never resolve to the first occurrence.
// Times always come from model inference. No uniform division or interpolation is used here.
export function mapAlignedWords(
  segments: { id: string; text: string }[],
  words: Word[],
  durationMs: number,
  runId: string,
): { cues: VoiceCue[]; subtitles: SubtitleCue[] } {
  const source = segments.map((s) => s.text).join('\n'),
    offsets: number[] = [];
  let at = 0;
  for (const s of segments) {
    offsets.push(at);
    at += s.text.length + 1;
  }
  const fail = (message: string): never => {
    throw new AppError('ALIGNMENT_MAPPING_FAILED', message, 422);
  };
  let cursor = 0,
    lastStart = 0;
  const mapped = words.map((w) => {
    const text = w.text.trim();
    if (
      !text ||
      w.startMs < 0 ||
      w.endMs < w.startMs ||
      w.endMs > durationMs ||
      w.startMs < lastStart
    )
      fail('模型时间无效或超出实际音频。');
    lastStart = w.startMs;
    const start = source.indexOf(text, cursor);
    if (start < 0) fail('模型词无法逐字映射到固定文稿；不插值补造位置。');
    const end = start + text.length;
    cursor = end;
    const i = segments.findIndex(
      (s, i) => start >= offsets[i] && end <= offsets[i] + s.text.length,
    );
    if (i < 0) fail('词跨越不明确的段落边界。');
    return {
      ...w,
      text,
      start,
      end,
      segment: segments[i],
      localStart: start - offsets[i],
      localEnd: end - offsets[i],
    };
  });
  // Every spoken letter/number must have a model text position; punctuation need not receive fake time.
  for (let i = 0; i < source.length; i++)
    if (/[\p{L}\p{N}]/u.test(source[i]) && !mapped.some((w) => i >= w.start && i < w.end))
      fail('部分文稿没有对齐词，不能标记完整强制对齐。');
  const cues: VoiceCue[] = [],
    subtitles: SubtitleCue[] = [];
  const make = (
    segment: { id: string; text: string },
    level: VoiceCue['level'],
    startChar: number,
    endChar: number,
    startMs: number,
    endMs: number,
  ): VoiceCue => ({
    id: randomUUID(),
    anchorId: randomUUID(),
    segmentId: segment.id,
    level,
    startChar,
    endChar,
    segmentTextSha256: createHash('sha256').update(segment.text).digest('hex'),
    text: segment.text.slice(startChar, endChar),
    startMs,
    endMs,
    alignment: 'forced',
    alignmentRunId: runId,
    confidence: null,
    stale: false,
  });
  for (const w of mapped)
    if (w.endMs > w.startMs)
      cues.push(make(w.segment, 'word', w.localStart, w.localEnd, w.startMs, w.endMs));
  for (const segment of segments)
    for (const match of segment.text.matchAll(/[^。！？.!?\n]+[。！？.!?]*/gu)) {
      if (!match[0].trim()) continue;
      const start = match.index!,
        end = start + match[0].length,
        items = mapped.filter(
          (w) =>
            w.segment.id === segment.id &&
            w.localStart < end &&
            w.localEnd > start &&
            w.endMs > w.startMs,
        );
      if (!items.length) fail('句子没有可用的模型声学时间。');
      const cue = make(
        segment,
        'sentence',
        start,
        end,
        Math.min(...items.map((w) => w.startMs)),
        Math.max(...items.map((w) => w.endMs)),
      );
      cues.push(cue);
      subtitles.push({
        id: randomUUID(),
        anchorId: cue.anchorId,
        segmentId: segment.id,
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
        sourceRunId: runId,
      });
    }
  for (const level of ['word', 'sentence']) {
    const xs = cues.filter((c) => c.level === level).sort((a, b) => a.startMs - b.startMs);
    if (xs.some((x, i) => i > 0 && x.startMs < xs[i - 1].endMs))
      fail('模型边界重叠，需人工核对，不能自动平均分配。');
  }
  return { cues, subtitles };
}

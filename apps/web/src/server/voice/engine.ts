import { createHash, randomUUID } from 'node:crypto';
import type { WorkflowState, WorkflowRevision } from '../../domain/workflow';
import type {
  VoiceCue,
  SubtitleCue,
  VoiceTimeline,
  VoiceJobInput,
  VoiceResult,
} from '../../domain/voice';
import { VoiceCueSchema, SubtitleCueSchema } from '../../domain/voice';
import { scriptSegments } from '../script/engine';
import { AppError } from '../errors';
const fail = (code: string, message: string, status = 422): never => {
  throw new AppError(code, message, status);
};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
export const voiceTimeline = (s: WorkflowState, id: string) =>
  s.voiceTimelines.find((t) => t.revisionId === id);
export const voiceCues = (s: WorkflowState, id: string): VoiceCue[] =>
  s.voiceCues
    .filter((c) => c.revisionId === id && !c.removed)
    .map((c) => c.value)
    .sort((a, b) => a.startMs - b.startMs || a.anchorId.localeCompare(b.anchorId));
export const subtitleTrack = (s: WorkflowState, id: string) =>
  s.subtitleTracks.find((t) => t.revisionId === id);
export function voiceContent(s: WorkflowState, r: WorkflowRevision) {
  const timeline = voiceTimeline(s, r.id);
  return timeline
    ? { timeline, cues: voiceCues(s, r.id), subtitles: subtitleTrack(s, r.id) }
    : r.text;
}
export function estimatedCues(
  s: WorkflowState,
  doc: VoiceTimeline,
  previous: VoiceCue[] = [],
): VoiceCue[] {
  const parts = scriptSegments(s, doc.scriptRevisionId).flatMap((segment) =>
    Array.from(segment.text.matchAll(/[^。！？.!?\n]+[。！？.!?]*/gu))
      .filter((m) => m[0].trim())
      .map((m) => ({ segment, text: m[0], start: m.index, end: m.index + m[0].length })),
  );
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  let used = 0;
  return parts.map((p, i) => {
    const startMs = Math.floor((used / total) * doc.durationMs);
    used += p.text.length;
    const old = previous.find(
      (c) =>
        c.segmentId === p.segment.id &&
        c.startChar === p.start &&
        c.endChar === p.end &&
        c.segmentTextSha256 === sha(p.segment.text) &&
        c.level === 'sentence',
    );
    return {
      id: old?.id ?? randomUUID(),
      anchorId: old?.anchorId ?? randomUUID(),
      segmentId: p.segment.id,
      level: 'sentence',
      startChar: p.start,
      endChar: p.end,
      segmentTextSha256: sha(p.segment.text),
      text: p.text,
      startMs,
      endMs: i === parts.length - 1 ? doc.durationMs : Math.floor((used / total) * doc.durationMs),
      alignment: doc.mode === 'none' ? 'planned' : 'estimated',
      confidence: null,
      stale: false,
    };
  });
}
export function subtitlesFor(cues: VoiceCue[], previous: SubtitleCue[] = []): SubtitleCue[] {
  return cues.map((c) => ({
    id: previous.find((p) => p.anchorId === c.anchorId)?.id ?? randomUUID(),
    anchorId: c.anchorId,
    segmentId: c.segmentId,
    startMs: c.startMs,
    endMs: c.endMs,
    text: c.text,
  }));
}
function overlap(xs: { startMs: number; endMs: number }[], code: string) {
  const order = [...xs].sort((a, b) => a.startMs - b.startMs);
  if (order.some((x, i) => i > 0 && x.startMs < order[i - 1].endMs))
    fail(code, '同层Cue或单轨字幕不能重叠。');
}
export function validateVoice(
  s: WorkflowState,
  doc: VoiceTimeline,
  cues: VoiceCue[],
  subtitles: SubtitleCue[],
) {
  if (doc.audio && doc.durationMs !== doc.audio.durationMs)
    fail('VOICE_DURATION_FIXED', '有音频时必须使用FFprobe实测时长。');
  if (
    new Set(cues.map((c) => c.id)).size !== cues.length ||
    new Set(cues.map((c) => c.anchorId)).size !== cues.length
  )
    fail('INVALID_ANCHOR', 'Cue ID与anchorId不能重复。');
  const segments = scriptSegments(s, doc.scriptRevisionId);
  for (const raw of cues) {
    const c = VoiceCueSchema.parse(raw),
      segment =
        segments.find((x) => x.id === c.segmentId) ??
        fail('INVALID_VOICE_REFERENCE', 'Cue必须属于固定文稿段落。');
    if (c.endMs > doc.durationMs) fail('VOICE_BOUNDS', 'Cue超出时间轴。');
    if (
      !c.stale &&
      (c.endChar > segment.text.length ||
        segment.text.slice(c.startChar, c.endChar) !== c.text ||
        sha(segment.text) !== c.segmentTextSha256)
    )
      fail('INVALID_TEXT_RANGE', '重复词请使用固定段落的精确字符位置与SHA，不可只按词串匹配。');
    for (const n of [c.startChar, c.endChar])
      if (
        n > 0 &&
        n < segment.text.length &&
        /[\uDC00-\uDFFF]/.test(segment.text[n]) &&
        /[\uD800-\uDBFF]/.test(segment.text[n - 1])
      )
        fail('INVALID_TEXT_RANGE', '字符位置不能切开UTF-16代理对。');
    if (doc.mode === 'none' && c.alignment !== 'planned')
      fail('INVALID_ALIGNMENT', '无口播Cue只表示静默编排，不是语音对齐。');
    if (doc.mode !== 'none' && c.alignment === 'planned')
      fail('INVALID_ALIGNMENT', '音频模式须标明手动或估算。');
  }
  for (const level of ['sentence', 'phrase', 'word'])
    overlap(
      cues.filter((c) => c.level === level),
      'VOICE_OVERLAP',
    );
  if (new Set(subtitles.map((c) => c.id)).size !== subtitles.length)
    fail('INVALID_SUBTITLE', '字幕ID不能重复。');
  for (const raw of subtitles) {
    const c = SubtitleCueSchema.parse(raw);
    if (c.endMs > doc.durationMs) fail('VOICE_BOUNDS', '字幕超出时间轴。');
    if (
      (c.segmentId !== null && !segments.some((x) => x.id === c.segmentId)) ||
      (c.anchorId && !cues.some((x) => x.anchorId === c.anchorId && x.segmentId === c.segmentId))
    )
      fail('INVALID_VOICE_REFERENCE', '字幕需绑定同一文稿段落及有效Cue。');
  }
  overlap(subtitles, 'SUBTITLE_OVERLAP');
  if (doc.alignmentConfirmed && (doc.audioStale || cues.some((c) => c.stale)))
    fail('STALE_CUES', '仍有失效Cue或音频，请重新核对后再确认。');
}
export function saveVoice(
  s: WorkflowState,
  r: WorkflowRevision,
  doc: VoiceTimeline,
  cues: VoiceCue[],
  subtitles: SubtitleCue[],
) {
  validateVoice(s, doc, cues, subtitles);
  for (const c of cues) {
    const used = s.voiceCues.find((x) => x.cueId === c.id || x.anchorId === c.anchorId);
    if (used && s.revisions.find((v) => v.id === used.revisionId)?.artifactId !== r.artifactId)
      fail('INVALID_ANCHOR', '锚点属于其他配音产物。');
  }
  for (const row of s.voiceCues.filter((x) => x.revisionId === r.id))
    row.removed = !cues.some((c) => c.id === row.cueId);
  for (const c of cues) {
    const row = s.voiceCues.find((x) => x.revisionId === r.id && x.cueId === c.id);
    if (row) {
      if (row.anchorId !== c.anchorId) fail('INVALID_ANCHOR', '现有Cue不能更换anchorId。');
      row.value = c;
      row.segmentId = c.segmentId;
      row.removed = false;
    } else
      s.voiceCues.push({
        id: randomUUID(),
        revisionId: r.id,
        cueId: c.id,
        anchorId: c.anchorId,
        segmentId: c.segmentId,
        value: c,
        removed: false,
        schemaVersion: 1,
      });
  }
  const old = voiceTimeline(s, r.id);
  if (old) Object.assign(old, doc);
  else s.voiceTimelines.push(doc);
  const track = subtitleTrack(s, r.id);
  if (track) track.cues = subtitles;
  else
    s.subtitleTracks.push({
      id: randomUUID(),
      revisionId: r.id,
      trackId: randomUUID(),
      language: 'zh-CN',
      cues: subtitles,
      schemaVersion: 1,
    });
  r.voiceSchemaVersion = 1;
  r.text = `配音时间轴 · ${doc.mode} · ${doc.durationMs}ms · ${cues.length} Cue · ${subtitles.length} 字幕`;
}
export function initializeVoice(
  s: WorkflowState,
  r: WorkflowRevision,
  scriptRevisionId: string,
  mode: VoiceTimeline['mode'],
  targetDurationMs: number,
) {
  const doc: VoiceTimeline = {
    id: randomUUID(),
    revisionId: r.id,
    scriptRevisionId,
    schemaVersion: 1,
    mode,
    durationMs: targetDurationMs,
    targetDurationMs,
    audio: null,
    alignmentConfirmed: false,
    timingBasis: mode === 'none' ? 'silent_plan' : 'pending_audio',
    audioStale: false,
  };
  const cues = estimatedCues(s, doc);
  saveVoice(s, r, doc, cues, subtitlesFor(cues));
}
export function cloneVoice(s: WorkflowState, old: WorkflowRevision, next: WorkflowRevision) {
  const doc = voiceTimeline(s, old.id);
  if (!doc) return;
  const scriptId =
    s.dependencies.find(
      (d) =>
        d.downstreamRevisionId === next.id &&
        s.revisions.find((v) => v.id === d.upstreamRevisionId)?.scriptSchemaVersion,
    )?.upstreamRevisionId ?? fail('SCRIPT_REQUIRED', '配音必须依赖结构化批准文稿。');
  const changed = scriptId !== doc.scriptRevisionId,
    copy = {
      ...structuredClone(doc),
      id: randomUUID(),
      revisionId: next.id,
      scriptRevisionId: scriptId,
      ...(changed ? { alignmentConfirmed: false, audioStale: !!doc.audio } : {}),
    };
  let cues = structuredClone(voiceCues(s, old.id)),
    subs = structuredClone(subtitleTrack(s, old.id)!.cues);
  if (changed) {
    const segments = scriptSegments(s, scriptId);
    cues = cues
      .filter((c) => segments.some((x) => x.id === c.segmentId))
      .map((c) => ({
        ...c,
        stale:
          c.stale ||
          segments.find((x) => x.id === c.segmentId)!.text !==
            scriptSegments(s, doc.scriptRevisionId).find((x) => x.id === c.segmentId)?.text,
      }));
    subs = subs.filter(
      (c) =>
        segments.some((x) => x.id === c.segmentId) &&
        (!c.anchorId || cues.some((x) => x.anchorId === c.anchorId)),
    );
  }
  saveVoice(s, next, copy, cues, subs);
  subtitleTrack(s, next.id)!.trackId = subtitleTrack(s, old.id)!.trackId;
}
export function assertVoiceSubmittable(s: WorkflowState, r: WorkflowRevision) {
  const doc = voiceTimeline(s, r.id);
  if (!doc) return;
  validateVoice(s, doc, voiceCues(s, r.id), subtitleTrack(s, r.id)!.cues);
  if (subtitleTrack(s, r.id)!.cues.some((c) => !c.segmentId))
    fail('SUBTITLE_BINDING_REQUIRED', '识别字幕仍是未绑定草稿，请人工选择段落或执行真实对齐。');
  if (doc.mode !== 'none' && (!doc.audio || doc.audio.purpose !== 'final'))
    fail('VOICE_AUDIO_REQUIRED', '请先导入或生成真实正式音频。');
  if (!doc.alignmentConfirmed)
    fail('VOICE_CONFIRM_REQUIRED', '请核对并确认当前手工/估算或静默时间基准。');
  if (!voiceCues(s, r.id).length || !subtitleTrack(s, r.id)!.cues.length)
    fail('VOICE_CUES_REQUIRED', '请建立Cue和字幕。');
}
export function finishVoice(s: WorkflowState, input: VoiceJobInput, result: VoiceResult) {
  const r = s.revisions.find((x) => x.id === input.revisionId),
    a = s.artifacts.find((x) => x.id === r?.artifactId),
    doc = r && voiceTimeline(s, r.id);
  if (
    !r ||
    !doc ||
    r.status !== 'draft' ||
    a?.currentRevisionId !== r.id ||
    r.version !== input.targetVersion
  )
    return 'TARGET_CHANGED';
  if (result.kind !== 'audio') {
    if (
      input.operation === 'audio' ||
      result.provider !== input.provider ||
      result.scriptRevisionId !== doc.scriptRevisionId ||
      doc.audio?.blob.sha256 !== result.audioSha256 ||
      result.audioSha256 !== input.blob?.sha256
    )
      return 'INVALID_VOICE_RESULT';
    if (result.kind === 'asr') {
      if (input.operation !== 'transcribe') return 'INVALID_VOICE_RESULT';
      const subtitles = result.subtitleDraft.map((c) => ({
        id: randomUUID(),
        anchorId: null,
        segmentId: null,
        ...c,
        sourceRunId: result.run.runId,
      }));
      saveVoice(s, r, { ...doc, alignmentConfirmed: false }, voiceCues(s, r.id), subtitles);
    } else {
      if (
        input.operation !== 'align' ||
        result.cues.some((c) => c.alignment !== 'forced' || c.alignmentRunId !== result.run.runId)
      )
        return 'INVALID_VOICE_RESULT';
      const previous = s.voiceCues.filter((c) => c.revisionId === r.id).map((c) => c.value),
        anchorMap = new Map<string, string>();
      const mapped = result.cues.map((c) => {
        const old = previous.find(
          (p) =>
            p.segmentId === c.segmentId &&
            p.level === c.level &&
            p.startChar === c.startChar &&
            p.endChar === c.endChar &&
            p.segmentTextSha256 === c.segmentTextSha256,
        );
        if (old) {
          anchorMap.set(c.anchorId, old.anchorId);
          return { ...c, id: old.id, anchorId: old.anchorId };
        }
        return c;
      });
      const subs = result.subtitles.map((c) => {
        const anchorId = c.anchorId ? (anchorMap.get(c.anchorId) ?? c.anchorId) : null;
        return {
          ...c,
          anchorId,
          id: subtitleTrack(s, r.id)!.cues.find((p) => p.anchorId === anchorId)?.id ?? c.id,
        };
      });
      saveVoice(s, r, { ...doc, alignmentConfirmed: false, audioStale: false }, mapped, subs);
    }
    r.version++;
    return null;
  }
  if (
    result.mode !== input.mode ||
    result.provider !== input.provider ||
    result.purpose !== input.purpose ||
    result.audio.origin !== input.mode ||
    result.audio.purpose !== input.purpose ||
    result.audio.provider !== input.provider ||
    result.audio.runId !== result.run.runId ||
    result.audio.durationMs > input.maxDurationMs ||
    result.audio.blob.sizeBytes > input.maxAudioBytes
  )
    return 'INVALID_VOICE_RESULT';
  if (input.blob && result.audio.blob.sha256 !== input.blob.sha256) return 'INVALID_VOICE_RESULT';
  if (input.purpose === 'preview') return null;
  const next = {
    ...doc,
    audio: result.audio,
    durationMs: result.audio.durationMs,
    timingBasis: 'audio' as const,
    alignmentConfirmed: false,
    audioStale: false,
  };
  const replacing = !!doc.audio;
  const old = voiceCues(s, r.id),
    cues = estimatedCues(s, next, old);
  saveVoice(s, r, next, cues, subtitlesFor(cues, subtitleTrack(s, r.id)!.cues));
  // Existing manual timing cannot survive an audio replacement without explicit user review.
  if (replacing || old.some((c) => c.alignment === 'manual'))
    for (const c of s.voiceCues.filter((c) => c.revisionId === r.id)) c.value.stale = true;
  r.version++;
  return null;
}

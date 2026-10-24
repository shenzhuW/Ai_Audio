import { z } from 'zod';
const id = z.uuid(),
  ms = z.number().int().nonnegative(),
  duration = z.number().int().positive(),
  sha = z.string().regex(/^[a-f0-9]{64}$/);
export const VoiceModeSchema = z.enum(['tts', 'import', 'none']);
export const AudioBlobSchema = z
  .object({
    id,
    name: z.string().min(1).max(180),
    mime: z.enum(['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/flac', 'audio/ogg']),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    sha256: sha,
  })
  .strict();
export const VoiceAudioSchema = z
  .object({
    blob: AudioBlobSchema,
    durationMs: duration,
    codec: z.string().min(1).max(100),
    sampleRate: z.number().int().positive(),
    channels: z.number().int().positive().max(8),
    origin: z.enum(['import', 'tts']),
    purpose: z.enum(['preview', 'final']),
    provider: z.string().max(100),
    runId: id,
  })
  .strict();
export const VoiceCueSchema = z
  .object({
    id,
    anchorId: id,
    segmentId: id,
    level: z.enum(['sentence', 'phrase', 'word']),
    startChar: ms,
    endChar: duration,
    segmentTextSha256: sha,
    text: z.string().min(1).max(10000),
    startMs: ms,
    endMs: duration,
    alignment: z.enum(['manual', 'estimated', 'planned', 'forced']),
    alignmentRunId: id.optional(),
    confidence: z.null(),
    stale: z.boolean(),
  })
  .strict()
  .refine((c) => c.endChar > c.startChar && c.endMs > c.startMs, 'Cue结束位置和时间必须大于开始');
export const SubtitleCueSchema = z
  .object({
    id,
    anchorId: id.nullable(),
    segmentId: id.nullable(),
    startMs: ms,
    endMs: duration,
    text: z.string().trim().min(1).max(10000),
    sourceRunId: id.optional(),
  })
  .strict()
  .refine((c) => c.endMs > c.startMs, '字幕结束时间必须大于开始');
export const VoiceTimelineSchema = z
  .object({
    id,
    revisionId: id,
    scriptRevisionId: id,
    schemaVersion: z.literal(1),
    mode: VoiceModeSchema,
    durationMs: duration,
    targetDurationMs: duration,
    audio: VoiceAudioSchema.nullable(),
    alignmentConfirmed: z.boolean(),
    timingBasis: z.enum(['audio', 'silent_plan', 'pending_audio']),
    audioStale: z.boolean(),
  })
  .strict();
export const VoiceCueRecordSchema = z
  .object({
    id,
    revisionId: id,
    cueId: id,
    anchorId: id,
    segmentId: id,
    value: VoiceCueSchema,
    removed: z.boolean(),
    schemaVersion: z.literal(1),
  })
  .strict();
export const SubtitleTrackSchema = z
  .object({
    id,
    revisionId: id,
    trackId: id,
    language: z.string().min(1).max(40),
    cues: z.array(SubtitleCueSchema).max(2000),
    schemaVersion: z.literal(1),
  })
  .strict();
export const VoiceRunSchema = z
  .object({
    provider: z.string().max(100),
    runId: id,
    startedAt: z.iso.datetime(),
    durationMs: ms,
    purpose: z.enum(['preview', 'final']),
    failureReason: z.string().max(100).nullable(),
    jobAttempt: z.number().int().positive().optional(),
    operation: z.enum(['audio', 'transcribe', 'align']).optional(),
    audioSha256: sha.optional(),
    inputSha256: sha.optional(),
    model: z.string().max(100).optional(),
    modelSha256: sha.optional(),
    referenceTextProvided: z.boolean().optional(),
    processId: z.number().int().positive().optional(),
    exitCode: z.number().int().nullable().optional(),
  })
  .strict();
const edit = { revisionId: id, expectedVersion: z.number().int().positive() };
const cues = z.array(VoiceCueSchema).max(2000),
  subtitles = z.array(SubtitleCueSchema).max(2000);
export const voiceCommands = [
  z
    .object({
      action: z.literal('voice-analyze'),
      ...edit,
      operation: z.enum(['transcribe', 'align']),
      provider: z.enum(['whisper-local', 'unconfigured', 'mock']),
    })
    .strict(),
  z
    .object({
      action: z.literal('voice-start'),
      scriptRevisionId: id,
      mode: VoiceModeSchema,
      legacyRevisionId: id.optional(),
      expectedVersion: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('voice-save'),
      ...edit,
      durationMs: duration,
      cues,
      subtitles,
      alignmentConfirmed: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('voice-mode'), ...edit, mode: VoiceModeSchema }).strict(),
  z.object({ action: z.literal('voice-retime'), ...edit }).strict(),
  z
    .object({
      action: z.literal('voice-generate'),
      ...edit,
      provider: z.enum(['windows-sapi', 'unconfigured', 'mock']),
      voice: z.string().min(1).max(150),
      rate: z.number().int().min(-10).max(10),
      purpose: z.enum(['preview', 'final']),
    })
    .strict(),
  z.object({ action: z.literal('voice-import'), ...edit, blob: AudioBlobSchema }).strict(),
] as const;
export const VoiceCommandSchema = z.discriminatedUnion('action', voiceCommands);
export const VoiceJobInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    revisionId: id,
    targetVersion: z.number().int().positive(),
    scriptRevisionId: id,
    operation: z.enum(['audio', 'transcribe', 'align']).default('audio'),
    language: z.enum(['zh', 'en']).default('zh'),
    mode: z.enum(['tts', 'import']),
    provider: z.enum(['windows-sapi', 'unconfigured', 'mock', 'audio-import', 'whisper-local']),
    voice: z.string().max(150),
    rate: z.number().int().min(-10).max(10),
    purpose: z.enum(['preview', 'final']),
    segments: z.array(z.object({ id, text: z.string().max(10000) }).strict()).max(300),
    blob: AudioBlobSchema.optional(),
    maxDurationMs: duration,
    maxAudioBytes: duration,
  })
  .strict();
const audioResult = z
  .object({
    kind: z.literal('audio').default('audio'),
    mode: z.enum(['tts', 'import']),
    provider: z.string().max(100),
    purpose: z.enum(['preview', 'final']),
    audio: VoiceAudioSchema,
    notes: z.string().max(3000),
    run: VoiceRunSchema,
  })
  .strict();
export const SpeechWordSchema = z
  .object({
    text: z.string().min(1).max(10000),
    startMs: ms,
    endMs: ms,
    probability: z.number().min(0).max(1).nullable(),
  })
  .strict()
  .refine((w) => w.endMs >= w.startMs);
const speechFields = {
  mode: z.enum(['tts', 'import']),
  provider: z.literal('whisper-local'),
  purpose: z.literal('final'),
  audioSha256: sha,
  scriptRevisionId: id,
  model: z.string().min(1).max(100),
  modelSha256: sha,
  engineVersion: z.string().max(100),
  notes: z.string().max(3000),
  run: VoiceRunSchema,
};
export const VoiceResultSchema = z.discriminatedUnion('kind', [
  audioResult,
  z
    .object({
      kind: z.literal('asr'),
      ...speechFields,
      transcript: z.string().max(100000),
      words: z.array(SpeechWordSchema).max(20000),
      subtitleDraft: z
        .array(
          z.object({ text: z.string().min(1).max(10000), startMs: ms, endMs: duration }).strict(),
        )
        .max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('alignment'),
      ...speechFields,
      words: z.array(SpeechWordSchema).min(1).max(20000),
      cues,
      subtitles,
    })
    .strict(),
]);
export type VoiceCue = z.infer<typeof VoiceCueSchema>;
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;
export type VoiceTimeline = z.infer<typeof VoiceTimelineSchema>;
export type VoiceJobInput = z.infer<typeof VoiceJobInputSchema>;
export type VoiceResult = z.infer<typeof VoiceResultSchema>;
export type VoiceRun = z.infer<typeof VoiceRunSchema>;
export type AudioBlob = z.infer<typeof AudioBlobSchema>;

import { z } from 'zod';
import { AiRunSchema } from './ai';
import { ScriptSegmentSchema } from './script';
import { VoiceTimelineSchema, VoiceCueSchema, SubtitleCueSchema } from './voice';
const id = z.uuid(),
  frame = z.number().int().nonnegative().max(2147483647),
  duration = frame.min(1),
  text = z.string().trim().min(1).max(2000),
  ids = z
    .array(id)
    .max(300)
    .refine((xs) => new Set(xs).size === xs.length, '引用不能重复');
export const VisualSearchIntentSchema = z
  .object({
    query: z.string().max(1000),
    subject: z.string().max(500),
    action: z.string().max(500),
    composition: z.string().max(1000),
    format: z.enum(['image', 'video', 'none']),
  })
  .strict();
export const DirectorShotSchema = z
  .object({
    shotId: id,
    title: text.max(150),
    narrativeGoal: text,
    viewerTakeaway: text,
    scriptSegmentIds: ids.min(1),
    voiceCueAnchorIds: ids,
    startFrame: frame,
    durationFrames: duration,
    endFrame: duration,
    visualType: z.enum(['diagram', 'chart', 'typography', 'footage', 'mixed']),
    route: z.enum(['code', 'pending', 'bound']),
    composition: text,
    layers: z
      .array(
        z
          .object({
            role: z.enum(['background', 'content', 'foreground', 'caption']),
            kind: z.enum(['graphic', 'text', 'media']),
            label: text.max(300),
            depth: z.number().min(0).max(3),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    transition: z
      .object({
        type: z.enum(['cut', 'match', 'push', 'dissolve']),
        durationFrames: frame,
        continuity: text,
      })
      .strict(),
    animation: z
      .object({
        mechanism: z.enum([
          'static_focus',
          'pan_target',
          'parallax25d',
          'highlight',
          'relationship',
          'data_change',
        ]),
        reason: text,
      })
      .strict(),
    visualSearchIntent: VisualSearchIntentSchema,
    media: z
      .object({
        sourceId: id,
        sourceInMs: z.number().int().nonnegative().nullable(),
        sourceOutMs: z.number().int().positive().nullable(),
        playback: z.enum(['once', 'loop', 'freeze']),
      })
      .strict()
      .nullable(),
    claimIds: ids,
    sourceIds: ids,
    risks: z.array(text).max(20),
  })
  .strict();
export const DirectorDocumentSchema = z
  .object({
    id,
    revisionId: id,
    schemaVersion: z.literal(1),
    scriptRevisionId: id,
    voiceRevisionId: id,
    researchRevisionId: id.nullable(),
    fps: z.literal(30),
    durationMs: z.number().int().positive(),
    totalFrames: duration,
    provenance: z.enum(['user', 'real', 'mock']),
    needsRebind: z.boolean(),
  })
  .strict();
export const DirectorShotRecordSchema = z
  .object({
    id,
    revisionId: id,
    shotId: id,
    order: frame,
    value: DirectorShotSchema,
    removed: z.boolean(),
    schemaVersion: z.literal(1),
  })
  .strict();
const edits = { revisionId: id, expectedVersion: z.number().int().positive() };
export const directorCommands = [
  z
    .object({
      action: z.literal('director-start'),
      scriptRevisionId: id,
      voiceRevisionId: id,
      legacyRevisionId: id.optional(),
      expectedVersion: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('director-save'),
      ...edits,
      shots: z.array(DirectorShotSchema).max(120),
    })
    .strict(),
  z
    .object({
      action: z.literal('director-generate'),
      ...edits,
      mode: z.enum(['real', 'mock', 'unconfigured']),
      shotCount: z.number().int().min(1).max(60),
      instruction: text.max(2500),
    })
    .strict(),
] as const;
export const DirectorCommandSchema = z.discriminatedUnion('action', directorCommands);
export const DirectorJobInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    revisionId: id,
    targetVersion: z.number().int().positive(),
    mode: z.enum(['real', 'mock', 'unconfigured']),
    instruction: z.string().max(2500),
    document: DirectorDocumentSchema,
    shotIds: ids.min(1).max(60),
    existingShots: z.array(DirectorShotSchema).max(120),
    brief: z
      .object({
        title: z.string(),
        prompt: z.string().max(50000),
        style: z.string(),
        audience: z.string(),
        width: z.number().int(),
        height: z.number().int(),
        targetDurationMs: z.number().int().positive(),
      })
      .strict(),
    segments: z.array(ScriptSegmentSchema).max(300),
    voice: VoiceTimelineSchema,
    cues: z.array(VoiceCueSchema).max(2000),
    subtitles: z.array(SubtitleCueSchema).max(2000),
    facts: z
      .array(
        z
          .object({
            claimId: id,
            text: z.string(),
            status: z.string(),
            caveats: z.string(),
            sourceIds: ids,
          })
          .strict(),
      )
      .max(500),
    sources: z
      .array(
        z
          .object({
            id,
            title: z.string(),
            sourceType: z.string(),
            sourceUrl: z.string().nullable(),
            publisher: z.string(),
            creator: z.string(),
            knownRestrictions: z.string(),
            licenseStatus: z.string(),
            selected: z.boolean(),
            blobSha256: z.string(),
            metadata: z
              .object({
                width: z.number().optional(),
                height: z.number().optional(),
                durationMs: z.number().optional(),
              })
              .strict()
              .nullable(),
            indexes: z
              .array(
                z
                  .object({
                    id,
                    summary: z.string().max(5000),
                    startMs: z.number().optional(),
                    endMs: z.number().optional(),
                    provenance: z.string(),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export const DirectorResultSchema = z
  .object({
    mode: z.enum(['real', 'mock']),
    shots: z.array(DirectorShotSchema).min(1).max(60),
    notes: z.string().max(3000),
    aiRun: AiRunSchema.optional(),
  })
  .strict();
export type DirectorShot = z.infer<typeof DirectorShotSchema>;
export type DirectorDocument = z.infer<typeof DirectorDocumentSchema>;
export type DirectorJobInput = z.infer<typeof DirectorJobInputSchema>;
export type DirectorResult = z.infer<typeof DirectorResultSchema>;
// One final ceil only. Each half-open shot uses exact integer frames; transitions remain inside it.
export const directorFrames = (durationMs: number, fps: number) =>
  Math.ceil((durationMs * fps) / 1000);
export function reflowShots(shots: DirectorShot[]): DirectorShot[] {
  let frame = 0;
  return shots.map((s) => {
    const startFrame = frame;
    frame += s.durationFrames;
    return { ...s, startFrame, endFrame: frame };
  });
}
export function shotTime(
  shot: DirectorShot,
  document: Pick<DirectorDocument, 'fps' | 'durationMs'>,
) {
  return {
    startMs: Math.floor((shot.startFrame * 1000) / document.fps),
    endMs: Math.min(document.durationMs, Math.ceil((shot.endFrame * 1000) / document.fps)),
  };
}
export function blankShot(
  segmentIds: string[],
  shotId: string,
  durationFrames: number,
): DirectorShot {
  return {
    shotId,
    title: '新镜头',
    narrativeGoal: '解释本镜头的核心问题',
    viewerTakeaway: '明确观众应理解的关系',
    scriptSegmentIds: segmentIds,
    voiceCueAnchorIds: [],
    startFrame: 0,
    durationFrames,
    endFrame: durationFrames,
    visualType: 'diagram',
    route: 'code',
    composition: '中央主对象；下方保留字幕安全区',
    layers: [{ role: 'content', kind: 'graphic', label: '解释对象', depth: 1 }],
    transition: { type: 'cut', durationFrames: 0, continuity: '延续同一解释对象' },
    animation: { mechanism: 'highlight', reason: '突出当前讲述对象' },
    visualSearchIntent: { query: '', subject: '', action: '', composition: '', format: 'none' },
    media: null,
    claimIds: [],
    sourceIds: [],
    risks: ['人工草稿，尚待审核'],
  };
}

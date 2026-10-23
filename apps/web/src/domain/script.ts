import { z } from 'zod';
import { AiRunSchema } from './ai';
const id = z.uuid();
export const purposeLabels = {
  hook: '开场钩子',
  context: '背景',
  explanation: '解释逻辑',
  evidence: '事实与案例',
  transition: '承接',
  conclusion: '总结',
} as const;
export const FactBindingSchema = z.object({ claimId: id, sourceIds: z.array(id).max(30) }).strict();
export const SegmentValueSchema = z
  .object({
    order: z.number().int().nonnegative(),
    text: z.string().max(10000),
    purpose: z
      .enum(['hook', 'context', 'explanation', 'evidence', 'transition', 'conclusion'])
      .default('explanation'),
    viewerTakeaway: z.string().max(1000).default(''),
    visualIntent: z.string().max(1500).default(''),
    delivery: z.enum(['normal', 'slow', 'brisk']).default('normal'),
    pauseMs: z.number().int().min(0).max(10000).default(300),
    factBindings: z.array(FactBindingSchema).max(30).default([]),
    needsRebind: z.boolean().default(false),
  })
  .strict();
export const ScriptSegmentSchema = SegmentValueSchema.omit({ order: true })
  .extend({ id, order: z.number().int().nonnegative().optional() })
  .strict();
export const SegmentRecordSchema = z.object({
  id,
  revisionId: id,
  segmentId: id,
  value: SegmentValueSchema,
  removed: z.boolean(),
  schemaVersion: z.literal(1),
});
export const ScriptDocumentSchema = z.object({
  id,
  revisionId: id,
  schemaVersion: z.literal(1),
  origin: z.enum(['user_provided', 'research', 'legacy']),
  researchRevisionId: id.nullable(),
  unitsPerMinute: z.number().min(60).max(600),
  provenance: z.enum(['user', 'mock', 'real']),
});
const revision = { revisionId: id, expectedVersion: z.number().int().positive() };
const editSegments = z
  .array(ScriptSegmentSchema)
  .max(300)
  .superRefine((xs, ctx) => {
    if (new Set(xs.map((x) => x.id)).size !== xs.length)
      ctx.addIssue({ code: 'custom', message: '段落 ID 重复。' });
    if (xs.map((x) => x.text).join('\n\n').length > 50000)
      ctx.addIssue({ code: 'custom', message: '文稿总长超过 50000 字符。' });
  });
export const scriptCommands = [
  z
    .object({
      action: z.literal('script-start'),
      origin: z.enum(['user_provided', 'research', 'legacy']),
      researchRevisionId: id.optional(),
      text: z.string().max(50000).default(''),
      unitsPerMinute: z.number().min(60).max(600).default(240),
    })
    .strict(),
  z
    .object({
      action: z.literal('script-save'),
      ...revision,
      segments: editSegments,
      unitsPerMinute: z.number().min(60).max(600),
    })
    .strict(),
  z
    .object({
      action: z.literal('script-generate'),
      ...revision,
      segmentId: id.optional(),
      instruction: z.string().trim().min(1).max(2500),
      mode: z.enum(['real', 'mock', 'unconfigured']),
    })
    .strict(),
] as const;
export const ScriptCommandSchema = z.discriminatedUnion('action', scriptCommands);
export const ScriptJobInputSchema = z.object({
  schemaVersion: z.literal(1),
  revisionId: id,
  targetVersion: z.number().int().positive(),
  researchRevisionId: id.nullable(),
  mode: z.enum(['real', 'mock', 'unconfigured']),
  segmentId: id.optional(),
  instruction: z.string().max(2500),
  brief: z.object({
    prompt: z.string().max(50000),
    targetDurationMs: z.number().positive(),
    language: z.string(),
    audience: z.string(),
    style: z.string(),
  }),
  segments: editSegments,
  facts: z
    .array(
      z.object({
        claimId: id,
        text: z.string(),
        status: z.string(),
        sourceIds: z.array(id),
        caveats: z.string(),
      }),
    )
    .max(500),
});
export const ScriptResultSchema = z
  .object({
    mode: z.enum(['mock', 'real']),
    segments: editSegments,
    notes: z.string().max(3000),
    aiRun: AiRunSchema.optional(),
  })
  .strict();
export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;
export type ScriptJobInput = z.infer<typeof ScriptJobInputSchema>;
export type ScriptResult = z.infer<typeof ScriptResultSchema>;
export type ScriptDocument = z.infer<typeof ScriptDocumentSchema>;
export function estimateScript(
  segments: ScriptSegment[],
  unitsPerMinute: number,
  targetDurationMs: number,
) {
  const details = segments.map((s) => {
    const han = (s.text.match(/[\p{Script=Han}]/gu) || []).length;
    const words = (
      s.text.replace(/[\p{Script=Han}]/gu, ' ').match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ||
      []
    ).length;
    const units = han + words;
    const factor = s.delivery === 'slow' ? 1.2 : s.delivery === 'brisk' ? 0.85 : 1;
    return {
      segmentId: s.id,
      units,
      estDurationMs: units
        ? Math.round(((units * 60000) / unitsPerMinute) * factor + s.pauseMs)
        : 0,
    };
  });
  const estDurationMs = details.reduce((n, x) => n + x.estDurationMs, 0);
  return {
    estDurationMs,
    targetDurationMs,
    differenceMs: estDurationMs - targetDurationMs,
    unitsPerMinute,
    details,
    note: '中文按汉字、其他文字按词粗估，含段落停顿；不是实测配音，段落不等于镜头。',
  };
}
export function scriptDiff(before: ScriptSegment[], after: ScriptSegment[]) {
  const fields = [
    'text',
    'purpose',
    'viewerTakeaway',
    'visualIntent',
    'delivery',
    'pauseMs',
    'factBindings',
    'needsRebind',
  ] as const;
  const ids = [...new Set([...before.map((s) => s.id), ...after.map((s) => s.id)])];
  return ids.flatMap((id) => {
    const a = before.find((x) => x.id === id),
      b = after.find((x) => x.id === id);
    const changes = !a
      ? ['added']
      : !b
        ? ['removed']
        : fields.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (a && b && before.indexOf(a) !== after.indexOf(b)) changes.push('order' as never);
    return changes.length ? [{ segmentId: id, changes, before: a ?? null, after: b ?? null }] : [];
  });
}

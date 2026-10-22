import { z } from 'zod';

export const BudgetSchema = z
  .object({ currency: z.literal('CNY'), amount: z.number().finite().min(0).max(1000000) })
  .strict();
export const CreateProjectSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    title: z.string().trim().min(1, '请输入项目标题').max(120),
    prompt: z.string().trim().min(1, '请输入创作需求或已有文稿').max(50000),
    targetDurationMs: z.number().int().positive().max(2147483647),
    fps: z.literal(30).default(30),
    width: z.number().int(),
    height: z.number().int(),
    language: z.string().trim().min(2).max(35).default('zh-CN'),
    entryType: z.enum(['topic', 'script', 'upload']),
    voiceMode: z.enum(['tts', 'import', 'none']),
    style: z.string().trim().max(200).default('科技感 / 清晰克制'),
    audience: z.string().trim().max(200).default('普通观众'),
    budgetLimit: BudgetSchema,
  })
  .strict()
  .refine(
    (p) => (p.width === 1080 && p.height === 1920) || (p.width === 1920 && p.height === 1080),
    { path: ['width'], message: '画幅仅支持 9:16 或 16:9，默认 1080p' },
  );
export const UpdateProjectSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(120).optional(),
    budgetLimit: BudgetSchema.optional(),
    style: z.string().trim().max(200).optional(),
    audience: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 1, '没有需要保存的修改');
export const AttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64),
});
export const ProjectSchema = z.object({
  id: z.uuid(),
  ownerId: z.string(),
  schemaVersion: z.literal(1),
  title: z.string(),
  status: z.literal('draft'),
  currentStage: z.literal('brief'),
  version: z.number().int().positive(),
  targetDurationMs: z.number().int().positive(),
  fps: z.literal(30),
  width: z.number(),
  height: z.number(),
  language: z.string(),
  style: z.string(),
  audience: z.string(),
  budgetLimit: BudgetSchema,
  input: z.object({
    schemaVersion: z.literal(1),
    prompt: z.string(),
    entryType: z.enum(['topic', 'script', 'upload']),
    voiceMode: z.enum(['tts', 'import', 'none']),
    attachments: z.array(AttachmentSchema),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type ProjectPatch = z.infer<typeof UpdateProjectSchema>;
export function parseDuration(input: string): number {
  const value = input.trim();
  if (!/^(\d+:)?\d+(\.\d{1,3})?$/.test(value))
    throw new Error('请输入秒数或分:秒，例如 30 或 4:00');
  const parts = value.split(':').map(Number);
  if (parts.length === 2 && parts[1] >= 60) throw new Error('分:秒格式中的秒数应小于 60');
  const ms = Math.round((parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0]) * 1000);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 2147483647)
    throw new Error('时长必须是大于零的有效数字');
  return ms;
}
export function formatDuration(ms: number): string {
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${
    ms % 1000
      ? '.' +
        String(ms % 1000)
          .padStart(3, '0')
          .replace(/0+$/, '')
      : ''
  }`;
}

import { z } from 'zod';
const id = z.uuid(),
  time = z.iso.datetime(),
  short = z.string().trim().max(2000);
export const ResearchBlobSchema = z
  .object({
    id,
    name: z.string().min(1).max(180),
    mime: z.enum([
      'text/plain',
      'text/markdown',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'video/mp4',
    ]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const ResearchMetadataSchema = z
  .object({
    mime: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().positive().max(32768).optional(),
    height: z.number().int().positive().max(32768).optional(),
    durationMs: z.number().int().positive().optional(),
    fps: z.number().positive().optional(),
    codec: short.optional(),
    pages: z.number().int().positive().optional(),
    truncated: z.boolean().optional(),
  })
  .strict();
export const CitationLocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), label: short.min(1) }).strict(),
  z
    .object({
      kind: z.literal('page'),
      page: z.number().int().positive(),
      label: short.default(''),
    })
    .strict(),
  z
    .object({
      kind: z.literal('time'),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().positive(),
      label: short.default(''),
    })
    .strict()
    .refine((x) => x.endMs > x.startMs),
  z.object({ kind: z.literal('image'), label: short.min(1) }).strict(),
]);
const sourceFields = {
  title: z.string().trim().min(1).max(250),
  sourceType: z.enum(['text', 'pdf', 'image', 'video']),
  sourceUrl: z
    .url()
    .max(2000)
    .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol))
    .optional(),
  publisher: short.default(''),
  creator: short.default(''),
  publishedAt: z.iso.date().nullable().default(null),
  knownRestrictions: short.default('未知'),
  licenseStatus: z
    .enum(['unknown', 'research_only', 'pending', 'cleared', 'blocked'])
    .default('unknown'),
  blob: ResearchBlobSchema,
};
export const ResearchUploadSourceSchema = z.object(sourceFields).strict();
export const SourceSchema = z
  .object({
    ...sourceFields,
    id,
    projectId: id,
    revisionId: id,
    schemaVersion: z.literal(1),
    retrievedAt: time,
    selected: z.boolean(),
    provenance: z.literal('user-upload'),
    urlStatus: z.literal('user_supplied'),
    metadata: ResearchMetadataSchema.optional(),
  })
  .strict();
export const ClaimInputSchema = z
  .object({
    text: z.string().trim().min(1).max(5000),
    asOf: z.iso.date().nullable().default(null),
    scope: short.default(''),
    unit: short.default(''),
    verificationStatus: z
      .enum(['unverified', 'supported', 'conflicting', 'withdrawn'])
      .default('unverified'),
    caveats: short.default(''),
  })
  .strict();
export const ClaimSchema = ClaimInputSchema.extend({
  id,
  revisionId: id,
  schemaVersion: z.literal(1),
}).strict();
export const ClaimEvidenceSchema = z
  .object({
    id,
    revisionId: id,
    claimId: id,
    sourceId: id,
    role: z.enum(['support', 'refute', 'context']),
    locator: CitationLocatorSchema,
    quote: z.string().trim().min(1).max(5000),
    validation: z.enum(['unvalidated', 'matched', 'mock']),
    schemaVersion: z.literal(1),
  })
  .strict();
export const IndexContentSchema = z
  .object({
    contentType: z.enum(['text', 'pdf_page', 'image', 'video_segment']),
    summary: z.string().trim().min(1).max(5000),
    keywords: z.array(z.string().max(100)).max(30),
    extractedText: z.string().max(100000).optional(),
    page: z.number().int().positive().optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().positive().optional(),
    frameRefs: z
      .array(
        z.object({ timeMs: z.number().int().nonnegative(), blob: ResearchBlobSchema }).strict(),
      )
      .max(6)
      .optional(),
    provenance: z.enum(['real', 'mock']),
  })
  .strict()
  .superRefine((e, c) => {
    if (
      e.contentType === 'video_segment' &&
      (e.startMs === undefined || e.endMs === undefined || e.endMs <= e.startMs)
    )
      c.addIssue({ code: 'custom', message: '视频索引需要有效起止时间' });
  });
export const ResearchIndexEntrySchema = IndexContentSchema.safeExtend({
  id,
  revisionId: id,
  sourceId: id,
  schemaVersion: z.literal(1),
});
export const ResearchJobInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('analyze'),
      revisionId: id,
      sourceId: id,
      blob: ResearchBlobSchema,
      mode: z.enum(['real', 'mock', 'unconfigured']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('search'),
      revisionId: id,
      query: z.string().trim().min(1).max(2000),
      mode: z.enum(['mock', 'unconfigured']),
    })
    .strict(),
]);
export const ResearchResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('analyze'),
      mode: z.enum(['real', 'mock']),
      metadata: ResearchMetadataSchema,
      entries: z.array(IndexContentSchema).max(100),
      warnings: z.array(short).max(30),
    })
    .strict(),
  z
    .object({
      kind: z.literal('search'),
      mode: z.literal('mock'),
      notes: short.min(1),
      candidates: z.array(z.never()).max(0),
    })
    .strict(),
]);
const edit = { revisionId: id, expectedVersion: z.number().int().positive() };
export const researchCommands = [
  z
    .object({ action: z.literal('research-source'), ...edit, source: ResearchUploadSourceSchema })
    .strict(),
  z
    .object({
      action: z.literal('research-source-edit'),
      ...edit,
      sourceId: id,
      selected: z.boolean(),
      knownRestrictions: short.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('research-claim'),
      ...edit,
      claimId: id.optional(),
      claim: ClaimInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('research-evidence'),
      ...edit,
      evidenceId: id.optional(),
      claimId: id,
      sourceId: id,
      role: z.enum(['support', 'refute', 'context']),
      quote: z.string().trim().min(1).max(5000),
      locator: CitationLocatorSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('research-analyze'),
      ...edit,
      sourceId: id,
      mode: z.enum(['real', 'mock', 'unconfigured']),
    })
    .strict(),
  z
    .object({
      action: z.literal('research-search'),
      ...edit,
      query: z.string().trim().min(1).max(2000),
      mode: z.enum(['mock', 'unconfigured']),
    })
    .strict(),
] as const;
export const ResearchCommandSchema = z.discriminatedUnion('action', researchCommands);
export type ResearchCommand = z.infer<typeof ResearchCommandSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ClaimEvidence = z.infer<typeof ClaimEvidenceSchema>;
export type ResearchIndexEntry = z.infer<typeof ResearchIndexEntrySchema>;
export type ResearchJobInput = z.infer<typeof ResearchJobInputSchema>;
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
export type ResearchBlob = z.infer<typeof ResearchBlobSchema>;
export const claimLabels = {
  unverified: '未核实',
  supported: '有支持引用 · 未独立核验',
  conflicting: '存在冲突',
  withdrawn: '已作废',
};

import { z } from 'zod';
import { AiRunSchema } from './ai';
import { DirectorShotSchema } from './director';
export const AssetProvenanceSchema = z
  .object({
    sourceAssetId: z.uuid(),
    provider: z.string().max(100),
    sourceUrl: z.url().nullable(),
    author: z.string().max(4000),
    license: z.string().max(4000),
    restrictions: z.string().max(4000),
    sourceInMs: z.number().int().nonnegative(),
    sourceOutMs: z.number().int().nonnegative(),
    purpose: z.enum(['illustrative', 'evidence']),
  })
  .strict();
const id = z.uuid(),
  sha = z.string().regex(/^[a-f0-9]{64}$/),
  at = z.iso.datetime();
const ms = z.number().int().nonnegative(),
  text = z.string().max(4000);
export const AssetBlobSchema = z
  .object({
    key: sha,
    sha256: sha,
    sizeBytes: z.number().int().positive().max(104857600),
    mime: z.enum(['image/png', 'image/jpeg', 'video/mp4', 'video/webm']),
  })
  .strict();
export const AssetMetadataSchema = z
  .object({
    kind: z.enum(['image', 'video']),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    durationMs: ms.nullable(),
    fps: z.number().nonnegative(),
    codec: z.string().max(100),
    format: z.string().max(100),
    frames: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const AssetIndexSchema = z
  .object({
    version: z.literal(1),
    sourceSha256: sha,
    frames: z
      .array(z.object({ id, atMs: ms, blob: AssetBlobSchema }).strict())
      .min(1)
      .max(6),
    contactSheet: AssetBlobSchema,
    sceneCutsMs: z.array(ms).max(1000),
    sharpness: z.number().nonnegative(),
    scope: z.literal('sparse_frames'),
  })
  .strict();
export const SourceAssetSchema = z
  .object({
    id,
    title: z.string().min(1).max(300),
    provider: z.enum(['project', 'library', 'nasa', 'commons']),
    sourceUrl: z
      .url()
      .max(2000)
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol))
      .nullable(),
    downloadUrl: z.url().max(2000).nullable(),
    author: text,
    restrictions: text,
    license: text,
    kind: z.enum(['image', 'video']),
    blob: AssetBlobSchema.nullable(),
    localRef: z
      .object({ area: z.enum(['research-blobs', 'blobs']), id })
      .strict()
      .nullable()
      .default(null),
    metadata: AssetMetadataSchema.nullable(),
    index: AssetIndexSchema.nullable(),
    status: z.enum(['discovered', 'indexed']),
    createdAt: at,
    originSourceId: id.nullable(),
    originProjectId: id.nullable(),
    searchTerms: z.string().max(1000),
  })
  .strict();
const scores = z
  .object({
    semantic: z.number().min(0).max(1),
    subject: z.number().min(0).max(1),
    action: z.number().min(0).max(1),
    composition: z.number().min(0).max(1),
    aspect: z.number().min(0).max(1),
    resolution: z.number().min(0).max(1),
    sharpness: z.number().min(0).max(1),
    duration: z.number().min(0).max(1),
  })
  .strict();
export const CandidateClipSchema = z
  .object({
    id,
    directorRevisionId: id,
    shotId: id,
    sourceAssetId: id,
    sourceInMs: ms,
    sourceOutMs: ms,
    method: z.enum(['real_visual', 'metadata', 'manual', 'mock']),
    score: z.number().min(0).max(1),
    scores,
    reasons: z.array(text).max(20),
    limitations: z.array(text).max(10),
    frameIds: z.array(id).max(6),
    frameSha256: z.array(sha).max(6),
    runId: z.string().max(200).nullable(),
    createdAt: at,
  })
  .strict();
export const AssetRecipeSchema = z
  .object({
    version: z.literal(1).default(1),
    sourceSha256: sha,
    sourceInMs: ms,
    sourceOutMs: ms,
    width: z.number().int().positive().max(3840),
    height: z.number().int().positive().max(3840),
    fps: z.literal(30),
    frames: z.number().int().positive().max(108000),
    fit: z.enum(['cover', 'contain']),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    playback: z.enum(['once', 'loop', 'freeze']),
    mute: z.literal(true),
  })
  .strict();
export const AssetBindingSchema = z
  .object({
    id,
    directorRevisionId: id,
    shotId: id,
    version: z.number().int().positive(),
    previousBindingId: id.nullable(),
    candidateId: id,
    sourceAssetId: id,
    recipe: AssetRecipeSchema,
    recipeHash: sha,
    purpose: z.enum(['illustrative', 'evidence']),
    confirmedBy: z.string().max(200),
    createdAt: at,
  })
  .strict();
export const PreparedAssetSchema = z
  .object({
    id,
    recipeHash: sha,
    sourceSha256: sha,
    blob: AssetBlobSchema,
    metadata: AssetMetadataSchema,
    recipe: AssetRecipeSchema,
    producerBindingId: id,
    createdAt: at,
    log: z.string().max(16000),
  })
  .strict();
const context = { directorRevisionId: id, shotId: id };
export const assetCommands = [
  z
    .object({
      action: z.literal('asset-search'),
      ...context,
      scope: z.enum(['all', 'local', 'nasa', 'commons', 'mock', 'unconfigured']),
      analysis: z.enum(['real', 'metadata', 'mock']),
      query: z.string().trim().min(1).max(300).optional(),
      topK: z.number().int().min(1).max(3).default(2),
    })
    .strict(),
  z
    .object({
      action: z.literal('asset-import'),
      blob: AssetBlobSchema,
      title: z.string().min(1).max(300),
      author: text.default(''),
      restrictions: text.default('使用限制未知；仅内部测试'),
      license: text.default('unknown'),
    })
    .strict(),
  z
    .object({
      action: z.literal('asset-candidate'),
      ...context,
      sourceAssetId: id,
      sourceInMs: ms,
      sourceOutMs: ms,
    })
    .strict(),
  z
    .object({
      action: z.literal('asset-bind'),
      ...context,
      candidateId: id,
      expectedBindingVersion: z.number().int().nonnegative(),
      sourceInMs: ms,
      sourceOutMs: ms,
      fit: z.enum(['cover', 'contain']).default('cover'),
      x: z.number().min(0).max(1).default(0.5),
      y: z.number().min(0).max(1).default(0.5),
      playback: z.enum(['once', 'loop', 'freeze']).default('once'),
      purpose: z.enum(['illustrative', 'evidence']).default('illustrative'),
    })
    .strict(),
  z.object({ action: z.literal('asset-prepare'), bindingId: id }).strict(),
] as const;
export const AssetCommandSchema = z.discriminatedUnion('action', assetCommands);
export const AssetJobInputSchema = z
  .object({
    operation: z.enum(['search', 'import', 'prepare']),
    directorRevisionId: id.nullable(),
    shot: DirectorShotSchema.nullable(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.literal(30),
    scope: z.enum(['all', 'local', 'nasa', 'commons', 'mock', 'unconfigured']),
    analysis: z.enum(['real', 'metadata', 'mock']),
    query: z.string().max(1000),
    topK: z.number().int().min(1).max(3),
    sources: z.array(SourceAssetSchema).max(500),
    binding: AssetBindingSchema.nullable(),
  })
  .strict();
export const AssetSearchRecordSchema = z
  .object({
    provider: z.string().max(100),
    query: z.string().max(1000),
    url: z.string().max(2000).nullable(),
    responseSha256: sha.nullable(),
    status: z.enum(['ok', 'empty', 'failed', 'mock', 'unconfigured']),
    count: z.number().int().nonnegative(),
    reason: text,
    at,
  })
  .strict();
export const AssetResultSchema = z
  .object({
    sources: z.array(SourceAssetSchema).max(100),
    candidates: z.array(CandidateClipSchema).max(30),
    prepared: PreparedAssetSchema.nullable(),
    cacheHit: z.boolean(),
    searches: z.array(AssetSearchRecordSchema).max(10),
    aiRuns: z.array(AiRunSchema).max(6),
    notes: text,
  })
  .strict();
export type SourceAsset = z.infer<typeof SourceAssetSchema>;
export type CandidateClip = z.infer<typeof CandidateClipSchema>;
export type AssetRecipe = z.infer<typeof AssetRecipeSchema>;
export type AssetBinding = z.infer<typeof AssetBindingSchema>;
export type PreparedAsset = z.infer<typeof PreparedAssetSchema>;
export type AssetJobInput = z.infer<typeof AssetJobInputSchema>;
export type AssetResult = z.infer<typeof AssetResultSchema>;
export type AssetBlob = z.infer<typeof AssetBlobSchema>;
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;

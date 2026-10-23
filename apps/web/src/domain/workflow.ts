import { z } from 'zod';
import { RenderInputSchema, RenderResultSchema } from './motion';
import {
  scriptCommands,
  ScriptDocumentSchema,
  SegmentRecordSchema,
  ScriptJobInputSchema,
  ScriptResultSchema,
} from './script';
import {
  researchCommands,
  SourceSchema,
  ClaimSchema,
  ClaimEvidenceSchema,
  ResearchIndexEntrySchema,
  ResearchJobInputSchema,
  ResearchResultSchema,
} from './research';
export const artifactTypes = [
  'research',
  'script',
  'voice',
  'storyboard',
  'motion',
  'review',
  'export',
] as const;
export const ArtifactTypeSchema = z.enum(artifactTypes);
const id = z.uuid();
const version = z.number().int().positive();
const at = z.iso.datetime();
const text = z.string().trim().min(1).max(50000);
export const ArtifactSchema = z.object({
  id,
  projectId: id,
  type: ArtifactTypeSchema,
  version,
  currentRevisionId: id.nullable(),
  approvedRevisionId: id.nullable(),
  createdAt: at,
});
export const RevisionSchema = z.object({
  id,
  artifactId: id,
  revisionNumber: version,
  schemaVersion: z.literal(1),
  version,
  text,
  contentHash: z.string().length(64),
  mock: z.boolean(),
  status: z.enum(['draft', 'in_review', 'approved', 'rejected']),
  parentRevisionId: id.nullable(),
  createdAt: at,
  updatedAt: at,
  createdBy: z.string(),
  researchSchemaVersion: z.literal(1).optional(),
  scriptSchemaVersion: z.literal(1).optional(),
});
export const DependencySchema = z.object({
  id,
  upstreamRevisionId: id,
  downstreamRevisionId: id,
  purpose: z.string(),
  segmentIds: z.array(id).min(1).optional(),
});
export const ApprovalSchema = z.object({
  id,
  revisionId: id,
  action: z.enum(['submit', 'approve', 'reject']),
  actorId: z.string(),
  comment: z.string(),
  at,
  expectedVersion: version,
});
export const AttemptSchema = z.object({
  number: version,
  startedAt: at,
  finishedAt: at.nullable(),
  state: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  errorCode: z.string().nullable(),
});
export const WorkflowJobSchema = z.object({
  id,
  kind: ArtifactTypeSchema,
  version,
  provider: z.enum(['mock', 'unconfigured', 'remotion', 'research', 'script']),
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  inputRevisionIds: z.array(id),
  idempotencyKey: z.string(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: version,
  attempts: z.array(AttemptSchema),
  targetVersion: z.number().int().nonnegative(),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: at.nullable(),
  resultRevisionId: id.nullable(),
  errorCode: z.string().nullable(),
  createdAt: at,
  updatedAt: at,
  renderInput: RenderInputSchema.optional(),
  renderResult: RenderResultSchema.optional(),
  researchInput: ResearchJobInputSchema.optional(),
  researchResult: ResearchResultSchema.optional(),
  scriptInput: ScriptJobInputSchema.optional(),
  scriptResult: ScriptResultSchema.optional(),
  progress: z.number().min(0).max(1).optional(),
  heartbeatAt: at.optional(),
  logs: z
    .array(z.object({ at, message: z.string().max(2000) }))
    .max(200)
    .optional(),
});
export const OutboxSchema = z.object({ id, jobId: id, delivered: z.boolean() });
export const ReceiptSchema = z.object({
  id,
  key: z.string(),
  fingerprint: z.string(),
  response: z.unknown(),
  createdAt: at,
});
export const AuditSchema = z.object({
  id,
  action: z.string(),
  actorId: z.string(),
  entityId: id,
  at,
});
export const WorkflowStateSchema = z.object({
  schemaVersion: z.literal(1),
  artifacts: z.array(ArtifactSchema),
  revisions: z.array(RevisionSchema),
  dependencies: z.array(DependencySchema),
  approvals: z.array(ApprovalSchema),
  jobs: z.array(WorkflowJobSchema),
  outbox: z.array(OutboxSchema),
  receipts: z.array(ReceiptSchema),
  audit: z.array(AuditSchema),
  researchSources: z.array(SourceSchema).default([]),
  researchClaims: z.array(ClaimSchema).default([]),
  researchEvidence: z.array(ClaimEvidenceSchema).default([]),
  researchIndexes: z.array(ResearchIndexEntrySchema).default([]),
  scriptDocuments: z.array(ScriptDocumentSchema).default([]),
  scriptSegments: z.array(SegmentRecordSchema).default([]),
});
const revisionAction = { revisionId: id, expectedVersion: version };
const jobAction = { jobId: id, expectedVersion: version };
export const WorkflowCommandSchema = z.discriminatedUnion('action', [
  ...researchCommands,
  ...scriptCommands,
  z.object({ action: z.literal('render'), input: RenderInputSchema }).strict(),
  z
    .object({
      action: z.literal('heartbeat'),
      jobId: id,
      workerId: z.string().min(1),
      progress: z.number().min(0).max(1),
      message: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('create'),
      type: ArtifactTypeSchema,
      text,
      inputRevisionIds: z.array(id).max(50).default([]),
      inputSegmentIds: z.array(id).min(1).max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('fork'),
      ...revisionAction,
      inputRevisionIds: z.array(id).max(50).optional(),
      inputSegmentIds: z.array(id).min(1).max(300).optional(),
    })
    .strict(),
  z.object({ action: z.literal('patch'), ...revisionAction, text }).strict(),
  z.object({ action: z.literal('submit'), ...revisionAction }).strict(),
  z
    .object({
      action: z.literal('approve'),
      ...revisionAction,
      comment: z.string().max(2000).default(''),
    })
    .strict(),
  z
    .object({
      action: z.literal('reject'),
      ...revisionAction,
      comment: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal('enqueue'),
      kind: z.enum(['research', 'script']),
      inputRevisionIds: z.array(id).max(50).default([]),
    })
    .strict(),
  z.object({ action: z.literal('cancel'), ...jobAction }).strict(),
  z.object({ action: z.literal('retry'), ...jobAction }).strict(),
  z.object({ action: z.literal('claim'), jobId: id, workerId: z.string().min(1) }).strict(),
  z
    .object({
      action: z.literal('finish'),
      jobId: id,
      workerId: z.string().min(1),
      text: text.optional(),
      errorCode: z.string().max(80).optional(),
      renderResult: RenderResultSchema.optional(),
      researchResult: ResearchResultSchema.optional(),
      scriptResult: ScriptResultSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('recover'), jobId: id }).strict(),
]);
export type WorkflowCommand = z.input<typeof WorkflowCommandSchema>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type WorkflowRevision = z.infer<typeof RevisionSchema>;
export type WorkflowJob = z.infer<typeof WorkflowJobSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export const workflowLabels: Record<ArtifactType, string> = {
  research: '研究资料',
  script: '口播文稿',
  voice: '配音时间轴',
  storyboard: '分镜与素材',
  motion: 'AI 动画制作',
  review: '成片审核',
  export: '导出成片',
};
export const statusLabels: Record<string, string> = {
  skipped: '已有文稿，研究可跳过',
  empty: '尚未开始',
  draft: '草稿',
  in_review: '待审核',
  approved: '已批准',
  rejected: '已驳回',
  stale: '依赖已失效',
  queued: '等待执行',
  running: '执行中',
  succeeded: '执行完成',
  failed: '失败',
  cancelled: '已取消',
};

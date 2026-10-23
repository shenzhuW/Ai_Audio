import { z } from 'zod';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { WorkflowRepository } from '../workflow/repository';
import { createWorkflowService } from '../workflow/service';
import { workflow } from '../workflow';
import { AppError } from '../errors';
import { config } from '../config';
import { researchBlobStore } from './storage';
import { ResearchUploadSourceSchema } from '../../domain/research';
import { researchProviderStatus } from './providers';
import type { ResearchIndexEntry } from '../../domain/research';
const orderIndexes = (entries: ResearchIndexEntry[]) =>
  entries.sort(
    (a, b) =>
      a.sourceId.localeCompare(b.sourceId) ||
      (a.page ?? 0) - (b.page ?? 0) ||
      (a.startMs ?? 0) - (b.startMs ?? 0) ||
      a.id.localeCompare(b.id),
  );
const missing = (): never => {
  throw new AppError('NOT_FOUND', '找不到研究来源或修订。', 404);
};
export function createResearchService(repo: WorkflowRepository) {
  const wf = createWorkflowService(repo);
  return {
    async read(projectId: string, owner: string, revisionId?: string) {
      z.uuid().parse(projectId);
      if (revisionId) z.uuid().parse(revisionId);
      const { state, project } = await repo.transaction(projectId, owner),
        artifact = state.artifacts.find((x) => x.type === 'research');
      const selected = revisionId ?? artifact?.currentRevisionId;
      const revision = selected
        ? (state.revisions.find((x) => x.id === selected && x.artifactId === artifact?.id) ??
          missing())
        : null;
      return {
        projectId,
        currentRevisionId: artifact?.currentRevisionId ?? null,
        revision,
        revisions: state.revisions
          .filter((x) => x.artifactId === artifact?.id)
          .sort((a, b) => b.revisionNumber - a.revisionNumber),
        sources: state.researchSources.filter((x) => x.revisionId === selected),
        claims: state.researchClaims.filter((x) => x.revisionId === selected),
        evidence: state.researchEvidence.filter((x) => x.revisionId === selected),
        indexes: orderIndexes(state.researchIndexes.filter((x) => x.revisionId === selected)),
        jobs: state.jobs.filter((x) => x.kind === 'research'),
        providers: researchProviderStatus,
        initialAttachments: project.input.attachments,
      };
    },
    async source(id: string, owner: string) {
      z.uuid().parse(id);
      const projectId = await repo.locate('researchSources', id, owner);
      const { state } = await repo.transaction(projectId, owner);
      const source = state.researchSources.find((x) => x.id === id) ?? missing();
      return {
        source,
        indexes: orderIndexes(state.researchIndexes.filter((x) => x.sourceId === id)),
      };
    },
    async upload(
      projectId: string,
      owner: string,
      body: {
        revisionId: string;
        expectedVersion: number;
        title: string;
        sourceUrl?: string;
        publisher?: string;
        creator?: string;
        publishedAt?: string | null;
        knownRestrictions?: string;
        licenseStatus?: 'unknown' | 'research_only' | 'pending' | 'blocked';
      },
      name: string,
      bytes: Buffer,
      key: string,
    ) {
      // Authorize before any file I/O. Original project requirements/attachments are never overwritten.
      await wf.read(projectId, owner);
      if (!key || key.length > 180)
        throw new AppError('IDEMPOTENCY_KEY_REQUIRED', '请提供有效 Idempotency-Key。', 400);
      const hash = createHash('sha256')
        .update(JSON.stringify([projectId, body.revisionId, key, name]))
        .update(bytes)
        .digest('hex');
      const blobId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const c = config(),
        blob = await researchBlobStore(join(c.dataDir, 'research-blobs'), c.maxUploadBytes).put(
          name,
          bytes,
          blobId,
        );
      const sourceType = blob.mime.startsWith('image/')
        ? 'image'
        : blob.mime === 'video/mp4'
          ? 'video'
          : blob.mime === 'application/pdf'
            ? 'pdf'
            : 'text';
      const { revisionId, expectedVersion, ...metadata } = body;
      const source = ResearchUploadSourceSchema.parse({ ...metadata, sourceType, blob });
      // A failed/concurrent transaction may leave a private unreferenced blob. Preserve it safely;
      // automatic cleanup must never remove a blob another idempotent upload already references.
      return wf.execute(
        projectId,
        owner,
        { action: 'research-source', revisionId, expectedVersion, source },
        key,
      );
    },
  };
}
export async function research() {
  await workflow();
  return createResearchService(
    await (globalThis as { studioWorkflow?: Promise<WorkflowRepository> }).studioWorkflow!,
  );
}
export type ResearchWorkspace = Awaited<
  ReturnType<ReturnType<typeof createResearchService>['read']>
>;

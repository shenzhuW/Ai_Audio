import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  SourceAssetSchema,
  AssetCommandSchema,
  type SourceAsset,
  type AssetBlob,
} from '../../domain/assets';
import type { WorkflowRepository } from '../workflow/repository';
import { workflow } from '../workflow';
import { applyWorkflow, staleRevisions } from '../workflow/engine';
import { directorShots } from '../director/engine';
import { latestBinding } from './engine';
import { config } from '../config';
import { assetStore } from './storage';
import { AppError } from '../errors';
import { createHash } from 'node:crypto';
function syncSources(
  s: import('../../domain/workflow').WorkflowState,
  p: import('../../domain/project').Project,
  library: SourceAsset[],
) {
  const insert = (
    blob: { sha256: string; sizeBytes: number; mime: string },
    title: string,
    ref: SourceAsset['localRef'],
    fields: Partial<SourceAsset> = {},
  ) => {
    if (
      !['image/png', 'image/jpeg', 'video/mp4', 'video/webm'].includes(blob.mime) ||
      s.sourceAssets.some((a) => a.blob?.sha256 === blob.sha256)
    )
      return;
    s.sourceAssets.push(
      SourceAssetSchema.parse({
        id: randomUUID(),
        title,
        provider: 'project',
        sourceUrl: null,
        downloadUrl: null,
        author: '',
        restrictions: '使用限制未知；仅内部测试',
        license: 'unknown',
        kind: blob.mime.startsWith('image/') ? 'image' : 'video',
        blob: { ...blob, key: blob.sha256 },
        localRef: ref,
        metadata: null,
        index: null,
        status: 'discovered',
        createdAt: new Date().toISOString(),
        originSourceId: null,
        originProjectId: p.id,
        searchTerms: title,
        ...fields,
      }),
    );
  };
  for (const source of s.researchSources)
    if (source.blob && ['image', 'video'].includes(source.sourceType))
      insert(
        source.blob,
        source.title,
        { area: 'research-blobs', id: source.blob.id },
        {
          sourceUrl: source.sourceUrl ?? null,
          author: source.creator,
          restrictions: source.knownRestrictions,
          license: source.licenseStatus,
          originSourceId: source.id,
        },
      );
  for (const b of p.input.attachments) insert(b, b.name, { area: 'blobs', id: b.id });
  for (const a of library)
    if (!s.sourceAssets.some((x) => x.blob?.sha256 === a.blob?.sha256))
      s.sourceAssets.push({ ...a, id: randomUUID(), provider: 'library', originSourceId: a.id });
  if (s.sourceAssets.length > 500)
    throw new AppError('ASSET_LIBRARY_LIMIT', '当前每项目最多索引 500 项素材，请缩小素材库。', 422);
}
export function createAssetService(repo: WorkflowRepository) {
  return {
    async execute(projectId: string, owner: string, raw: unknown, key: string) {
      z.uuid().parse(projectId);
      const c = AssetCommandSchema.parse(raw);
      // Owner-scoped library is loaded by the coordinator, never exposed as a directory to AI.
      const library = c.action === 'asset-search' ? ((await repo.assetLibrary?.(owner)) ?? []) : [];
      return (
        await repo.transaction(projectId, owner, (state, project) => {
          const next = structuredClone(state);
          if (c.action === 'asset-search') syncSources(next, project, library);
          return applyWorkflow(next, project, c, key, owner);
        })
      ).result;
    },
    async read(projectId: string, owner: string, directorId?: string) {
      z.uuid().parse(projectId);
      if (directorId) z.uuid().parse(directorId);
      const { state: s, project: p } = await repo.transaction(projectId, owner),
        a = s.artifacts.find((a) => a.type === 'storyboard'),
        selected = directorId ?? a?.approvedRevisionId ?? undefined,
        stale = staleRevisions(s);
      const director = selected
        ? (s.revisions.find((r) => r.id === selected && r.artifactId === a?.id) ?? null)
        : null;
      if (directorId && !director) throw new AppError('NOT_FOUND', '导演版不存在。', 404);
      const shots = selected ? directorShots(s, selected) : [];
      return {
        projectId,
        director,
        approvedDirectorId: a?.approvedRevisionId ?? null,
        stale: !!selected && stale.has(selected),
        shots,
        sources: s.sourceAssets,
        candidates: s.candidateClips.filter((c) => c.directorRevisionId === selected),
        bindings: s.assetBindings.filter((b) => b.directorRevisionId === selected),
        prepared: s.preparedAssets,
        status: shots.map((shot) => {
          const b = latestBinding(s, selected!, shot.shotId);
          return {
            shotId: shot.shotId,
            bindingId: b?.id ?? null,
            status: stale.has(selected!)
              ? 'stale'
              : !b
                ? shot.route === 'code'
                  ? 'code'
                  : 'pending'
                : s.preparedAssets.some((p) => p.recipeHash === b.recipeHash)
                  ? 'ready'
                  : 'preparing',
          };
        }),
        jobs: s.jobs.filter((j) => j.provider === 'asset'),
        width: p.width,
        height: p.height,
        providers: [
          { id: 'local', mode: 'real' },
          { id: 'nasa', mode: 'real' },
          { id: 'commons', mode: 'real' },
          { id: 'pexels', mode: 'unconfigured' },
          { id: 'pixabay', mode: 'unconfigured' },
        ],
        vision: process.env.STUDIO_CODEX_ENABLED === '1' ? 'real' : 'unconfigured',
      };
    },
    async file(projectId: string, owner: string, key: string) {
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(key);
      const { state: s } = await repo.transaction(z.uuid().parse(projectId), owner);
      const source = s.sourceAssets.find((a) => a.blob?.key === key);
      const blobs: AssetBlob[] = s.sourceAssets
        .flatMap((a) =>
          a.index ? [a.index.contactSheet, ...a.index.frames.map((f) => f.blob)] : [],
        )
        .concat(s.preparedAssets.map((p) => p.blob));
      const blob = source?.blob ?? blobs.find((b) => b.key === key);
      if (!blob) throw new AppError('NOT_FOUND', '本项目没有该素材文件。', 404);
      if (source?.localRef) {
        const bytes = await readFile(
          join(config().dataDir, source.localRef.area, source.localRef.id),
        );
        if (
          bytes.length !== blob.sizeBytes ||
          createHash('sha256').update(bytes).digest('hex') !== blob.sha256
        )
          throw new Error('ASSET_SOURCE_CHANGED');
        return { bytes, blob };
      }
      return { bytes: await assetStore(config().dataDir).read(blob), blob };
    },
  };
}
export async function assets() {
  await workflow();
  return createAssetService(
    await (globalThis as { studioWorkflow?: Promise<WorkflowRepository> }).studioWorkflow!,
  );
}
export type AssetWorkspace = Awaited<ReturnType<ReturnType<typeof createAssetService>['read']>>;

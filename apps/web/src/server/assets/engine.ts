import { randomUUID } from 'node:crypto';
import {
  AssetCommandSchema,
  AssetRecipeSchema,
  type AssetResult,
  type AssetJobInput,
  type SourceAsset,
  type CandidateClip,
} from '../../domain/assets';
import type { WorkflowState, WorkflowJob } from '../../domain/workflow';
import type { Project } from '../../domain/project';
import { directorShots } from '../director/engine';
import { AppError } from '../errors';
import { recipeHash, validateRange } from './recipe';
export function renderAssetProvenance(
  s: WorkflowState,
  b: import('../../domain/assets').AssetBinding,
) {
  const a = s.sourceAssets.find((a) => a.id === b.sourceAssetId);
  if (!a) throw new AppError('ASSET_SOURCE_MISSING', '素材来源缺失。', 422);
  return {
    sourceAssetId: a.id,
    provider: a.provider,
    sourceUrl: a.sourceUrl,
    author: a.author,
    license: a.license,
    restrictions: a.restrictions,
    sourceInMs: b.recipe.sourceInMs,
    sourceOutMs: b.recipe.sourceOutMs,
    purpose: b.purpose,
  };
}
const fail = (code: string, message: string, status = 422): never => {
  throw new AppError(code, message, status);
};
export function latestBinding(s: WorkflowState, director: string, shot: string) {
  return s.assetBindings
    .filter((b) => b.directorRevisionId === director && b.shotId === shot)
    .sort((a, b) => b.version - a.version)[0];
}
export function assetDirector(s: WorkflowState, id: string, stale: Set<string>) {
  const r = s.revisions.find((r) => r.id === id);
  if (
    !r?.directorSchemaVersion ||
    r.status !== 'approved' ||
    s.artifacts.find((a) => a.id === r.artifactId)?.approvedRevisionId !== id ||
    stale.has(id)
  )
    fail('STALE_INPUT', '素材任务只接收当前有效批准导演版。');
  return r!;
}
export function applyAsset(
  s: WorkflowState,
  project: Project,
  raw: unknown,
  now: string,
  actor: string,
  stale: Set<string>,
  enqueue: (ids: string[]) => WorkflowJob,
) {
  const c = AssetCommandSchema.parse(raw);
  const base: AssetJobInput = {
    operation: 'search',
    directorRevisionId: null,
    shot: null,
    width: project.width,
    height: project.height,
    fps: 30,
    scope: 'local',
    analysis: 'metadata',
    query: '',
    topK: 2,
    sources: structuredClone(s.sourceAssets),
    binding: null,
  };
  const queue = (input: AssetJobInput) => {
    const j = enqueue(input.directorRevisionId ? [input.directorRevisionId] : []);
    j.provider = 'asset';
    j.assetInput = input;
    j.progress = 0;
    j.logs = [{ at: now, message: '素材任务排队；来源/导演/逐镜绑定输入已冻结。' }];
    return j;
  };
  if (c.action === 'asset-import') {
    const same = s.sourceAssets.find((a) => a.blob?.sha256 === c.blob.sha256);
    if (same) return same;
    const source: SourceAsset = {
      id: randomUUID(),
      title: c.title,
      provider: 'project',
      sourceUrl: null,
      downloadUrl: null,
      author: c.author,
      restrictions: c.restrictions,
      license: c.license,
      localRef: null,
      kind: c.blob.mime.startsWith('image/') ? 'image' : 'video',
      blob: c.blob,
      metadata: null,
      index: null,
      status: 'discovered',
      createdAt: now,
      originSourceId: null,
      originProjectId: project.id,
      searchTerms: c.title,
    };
    s.sourceAssets.push(source);
    return queue({ ...base, operation: 'import', sources: [source] });
  }
  if (c.action === 'asset-prepare') {
    const b =
      s.assetBindings.find((b) => b.id === c.bindingId) ??
      fail('NOT_FOUND', '素材绑定不存在。', 404);
    assetDirector(s, b.directorRevisionId, stale);
    if (latestBinding(s, b.directorRevisionId, b.shotId)?.id !== b.id)
      fail('ASSET_BINDING_CHANGED', '绑定已替换，请重新载入。', 409);
    return queue({
      ...base,
      operation: 'prepare',
      directorRevisionId: b.directorRevisionId,
      shot: directorShots(s, b.directorRevisionId).find((x) => x.shotId === b.shotId)!,
      binding: b,
    });
  }
  assetDirector(s, c.directorRevisionId, stale);
  const shot =
    directorShots(s, c.directorRevisionId).find((x) => x.shotId === c.shotId) ??
    fail('ASSET_SHOT_INVALID', '镜头不属于固定导演版。');
  if (shot.route === 'code')
    fail('ASSET_ROUTE_REQUIRES_FORK', '纯代码改为素材路线须先显式 Fork 并批准导演方案。');
  if (c.action === 'asset-search') {
    const v = shot.visualSearchIntent;
    return queue({
      ...base,
      directorRevisionId: c.directorRevisionId,
      shot,
      scope: c.scope,
      analysis: c.analysis,
      topK: c.topK,
      query:
        c.query ??
        [
          v.subject,
          v.action,
          v.composition,
          v.format,
          project.width > project.height ? 'landscape' : 'portrait',
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 1000),
    });
  }
  const candidate =
    c.action === 'asset-bind'
      ? (s.candidateClips.find((x) => x.id === c.candidateId) ??
        fail('NOT_FOUND', '候选不存在。', 404))
      : null;
  if (
    candidate &&
    (candidate.directorRevisionId !== c.directorRevisionId || candidate.shotId !== c.shotId)
  )
    fail('ASSET_CANDIDATE_INVALID', '候选不属于本镜头及导演版。');
  const source =
    s.sourceAssets.find(
      (a) => a.id === (c.action === 'asset-bind' ? candidate!.sourceAssetId : c.sourceAssetId),
    ) ?? fail('NOT_FOUND', '素材不存在。', 404);
  if (!source.metadata || !source.blob || !source.index)
    fail('ASSET_NOT_INDEXED', '请先下载、验证并建立真实索引。');
  validateRange(
    source.metadata!,
    c.sourceInMs,
    c.sourceOutMs,
    c.action === 'asset-bind' ? (shot.durationFrames / 30) * 1000 : 0,
    c.action === 'asset-bind' ? c.playback : 'loop',
  );
  if (c.action === 'asset-candidate') {
    const x: CandidateClip = {
      id: randomUUID(),
      directorRevisionId: c.directorRevisionId,
      shotId: c.shotId,
      sourceAssetId: source.id,
      sourceInMs: c.sourceInMs,
      sourceOutMs: c.sourceOutMs,
      method: 'manual',
      score: 0,
      scores: {
        semantic: 0,
        subject: 0,
        action: 0,
        composition: 0,
        aspect: 0,
        resolution: 0,
        sharpness: 0,
        duration: 0,
      },
      reasons: ['用户手动选择区间；不是模型视觉评分'],
      limitations: ['人工区间，未自动核实画面语义'],
      frameIds: [],
      frameSha256: [],
      runId: null,
      createdAt: now,
    };
    s.candidateClips.push(x);
    return x;
  }
  const previous = latestBinding(s, c.directorRevisionId, c.shotId);
  if ((previous?.version ?? 0) !== c.expectedBindingVersion)
    fail('ASSET_BINDING_CONFLICT', '本镜头素材已变化，请重新载入。', 409);
  if (candidate!.method === 'mock') fail('ASSET_MOCK_NOT_READY', 'Mock 候选不能作为真实素材绑定。');
  const recipe = AssetRecipeSchema.parse({
    version: 1,
    sourceSha256: source.blob!.sha256,
    sourceInMs: c.sourceInMs,
    sourceOutMs: c.sourceOutMs,
    width: project.width,
    height: project.height,
    fps: 30,
    frames: shot.durationFrames,
    fit: c.fit,
    x: c.x,
    y: c.y,
    playback: c.playback,
    mute: true,
  });
  const b = {
    id: randomUUID(),
    directorRevisionId: c.directorRevisionId,
    shotId: c.shotId,
    version: (previous?.version ?? 0) + 1,
    previousBindingId: previous?.id ?? null,
    candidateId: c.candidateId,
    sourceAssetId: source.id,
    recipe,
    recipeHash: recipeHash(recipe),
    purpose: c.purpose,
    confirmedBy: actor,
    createdAt: now,
  };
  s.assetBindings.push(b);
  const j = queue({
    ...base,
    operation: 'prepare',
    directorRevisionId: c.directorRevisionId,
    shot,
    binding: b,
  });
  return { ...b, jobId: j.id };
}
export function finishAsset(
  s: WorkflowState,
  input: AssetJobInput,
  out: AssetResult,
  stale: Set<string>,
): string | null {
  try {
    if (input.directorRevisionId) assetDirector(s, input.directorRevisionId, stale);
    if (
      input.binding &&
      latestBinding(s, input.binding.directorRevisionId, input.binding.shotId)?.id !==
        input.binding.id
    )
      return 'ASSET_BINDING_CHANGED';
    // Validate all relations before changing state; callers never commit a partial result.
    const next = structuredClone(s);
    for (const source of out.sources) {
      const old = next.sourceAssets.find((a) => a.id === source.id);
      if (old?.blob && source.blob?.sha256 !== old.blob.sha256) return 'ASSET_SOURCE_CHANGED';
      if (source.metadata && (!source.blob || source.index?.sourceSha256 !== source.blob.sha256))
        return 'ASSET_RESULT_INVALID';
      if (old) Object.assign(old, source);
      else next.sourceAssets.push(source);
    }
    for (const c of out.candidates) {
      if (c.directorRevisionId !== input.directorRevisionId || c.shotId !== input.shot?.shotId)
        return 'ASSET_RESULT_INVALID';
      const a = next.sourceAssets.find((a) => a.id === c.sourceAssetId);
      if (
        !a?.metadata ||
        !a.index ||
        c.frameIds.some(
          (id, i) =>
            !a.index!.frames.some((f) => f.id === id && f.blob.sha256 === c.frameSha256[i]),
        )
      )
        return 'ASSET_RESULT_INVALID';
      validateRange(a.metadata, c.sourceInMs, c.sourceOutMs, 0, 'loop');
      if (
        c.method === 'real_visual' &&
        (!c.frameIds.length ||
          !c.runId ||
          !out.aiRuns.some(
            (r) => r.runId === c.runId && !r.failureReason && r.searchMode === 'disabled',
          ))
      )
        return 'ASSET_RESULT_INVALID';
      if (
        a.metadata.kind === 'video' &&
        c.frameIds.some((id) => {
          const f = a.index!.frames.find((f) => f.id === id)!;
          return f.atMs < c.sourceInMs || f.atMs >= c.sourceOutMs;
        })
      )
        return 'ASSET_RESULT_INVALID';
      if (!next.candidateClips.some((x) => x.id === c.id)) next.candidateClips.push(c);
    }
    if (out.prepared) {
      const p = out.prepared,
        b = input.binding;
      if (
        !b ||
        p.recipeHash !== b.recipeHash ||
        p.recipeHash !== recipeHash(p.recipe) ||
        p.sourceSha256 !== b.recipe.sourceSha256 ||
        p.metadata.frames !== b.recipe.frames ||
        p.metadata.width !== b.recipe.width ||
        p.metadata.height !== b.recipe.height ||
        p.metadata.fps !== 30 ||
        p.metadata.codec !== 'h264'
      )
        return 'ASSET_RESULT_INVALID';
      if (!next.preparedAssets.some((x) => x.recipeHash === p.recipeHash))
        next.preparedAssets.push(p);
    }
    s.sourceAssets = next.sourceAssets;
    s.candidateClips = next.candidateClips;
    s.preparedAssets = next.preparedAssets;
    return null;
  } catch (e) {
    return e instanceof AppError ? e.code : 'ASSET_RESULT_INVALID';
  }
}

import { randomUUID } from 'node:crypto';
import type { WorkflowState, WorkflowRevision } from '../../domain/workflow';
import type { Project } from '../../domain/project';
import {
  DirectorShotSchema,
  DirectorJobInputSchema,
  directorFrames,
  shotTime,
  type DirectorShot,
  type DirectorDocument,
  type DirectorJobInput,
  type DirectorResult,
} from '../../domain/director';
import { scriptSegments, scriptDocument } from '../script/engine';
import { voiceTimeline, voiceCues, subtitleTrack } from '../voice/engine';
import { AppError } from '../errors';
const fail = (code: string, message: string): never => {
  throw new AppError(code, message, 422);
};
export const directorDocument = (s: WorkflowState, id: string) =>
  s.directorDocuments.find((d) => d.revisionId === id);
export const directorShots = (s: WorkflowState, id: string) =>
  s.directorShots
    .filter((r) => r.revisionId === id && !r.removed)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.value);
export function directorContent(s: WorkflowState, r: WorkflowRevision) {
  return r.directorSchemaVersion
    ? { document: directorDocument(s, r.id), shots: directorShots(s, r.id) }
    : r.text;
}
export function directorSources(s: WorkflowState, researchId: string | null) {
  return s.researchSources.filter((x) => x.revisionId === researchId && x.selected);
}
export function validateDirector(s: WorkflowState, doc: DirectorDocument, shots: DirectorShot[]) {
  const segments = scriptSegments(s, doc.scriptRevisionId),
    voice =
      voiceTimeline(s, doc.voiceRevisionId) ?? fail('VOICE_REQUIRED', '缺少结构化语音时间轴。');
  if (
    voice.scriptRevisionId !== doc.scriptRevisionId ||
    !voice.alignmentConfirmed ||
    voice.audioStale
  )
    fail('VOICE_INPUT_MISMATCH', '配音需已确认且绑定同一批准文稿。');
  const cues = voiceCues(s, doc.voiceRevisionId),
    sources = directorSources(s, doc.researchRevisionId);
  if (new Set(shots.map((x) => x.shotId)).size !== shots.length)
    fail('DIRECTOR_ID_INVALID', '镜头ID不能重复。');
  let end = 0;
  for (const raw of shots) {
    const shot = DirectorShotSchema.parse(raw);
    if (
      shot.startFrame !== end ||
      shot.endFrame !== shot.startFrame + shot.durationFrames ||
      shot.endFrame > doc.totalFrames ||
      shot.transition.durationFrames >= shot.durationFrames
    )
      fail('DIRECTOR_TIMELINE', '镜头必须连续、正时长且不超出固定时间轴；转场包含在镜头内部。');
    end = shot.endFrame;
    if (shot.scriptSegmentIds.some((id) => !segments.some((x) => x.id === id)))
      fail('DIRECTOR_REFERENCE_INVALID', '文稿段落不属于固定修订。');
    if (voice.mode === 'none' && shot.voiceCueAnchorIds.length)
      fail('DIRECTOR_CUE_INVALID', '静默计划不建立语音锚点。');
    for (const id of shot.voiceCueAnchorIds) {
      const c = cues.find((c) => c.anchorId === id);
      if (!c || c.stale || !shot.scriptSegmentIds.includes(c.segmentId))
        fail('DIRECTOR_CUE_INVALID', '锚点不属于固定配音和所选文稿。');
    }
    const allowedClaims = segments
      .filter((x) => shot.scriptSegmentIds.includes(x.id))
      .flatMap((x) => x.factBindings.map((b) => b.claimId));
    for (const id of shot.claimIds)
      if (
        !allowedClaims.includes(id) ||
        !s.researchClaims.some((c) => c.id === id && c.revisionId === doc.researchRevisionId)
      )
        fail('DIRECTOR_CLAIM_INVALID', '事实引用需来自当前镜头所用文稿及固定研究。');
    if (shot.sourceIds.some((id) => !sources.some((x) => x.id === id)))
      fail('DIRECTOR_SOURCE_INVALID', '来源不在固定研究的已选允许集中。');
    for (const id of shot.claimIds)
      if (!s.researchEvidence.some((e) => e.claimId === id && shot.sourceIds.includes(e.sourceId)))
        fail('DIRECTOR_CLAIM_INVALID', '镜头事实需包含对应Source引用。');
    if (
      shot.route === 'pending' &&
      (!shot.visualSearchIntent.query.trim() ||
        !shot.visualSearchIntent.subject.trim() ||
        shot.visualSearchIntent.format === 'none' ||
        shot.media)
    )
      fail('VISUAL_PLAN_REQUIRED', '待匹配方案需明确检索主题/查询/媒体类型，不能冒充已绑定素材。');
    if (
      shot.route === 'code' &&
      (shot.media ||
        shot.visualSearchIntent.format !== 'none' ||
        shot.layers.some((l) => l.kind === 'media'))
    )
      fail('VISUAL_PLAN_REQUIRED', '纯代码路线不能假装存在媒体；请选择图形/文字层。');
    if (shot.route === 'bound') {
      const source = sources.find((x) => x.id === shot.media?.sourceId);
      if (
        !source ||
        !['image', 'video'].includes(source.sourceType) ||
        !source.metadata ||
        !shot.sourceIds.includes(source.id)
      )
        fail('DIRECTOR_SOURCE_INVALID', '仅可绑定已真实提取元数据的固定研究媒体，并保留来源。');
      const validSource = source!;
      const metadata = validSource.metadata!;
      const media = shot.media!;
      if (
        validSource.sourceType === 'video' &&
        (media.sourceInMs === null ||
          media.sourceOutMs === null ||
          media.sourceOutMs <= media.sourceInMs ||
          media.sourceOutMs > (metadata.durationMs ?? 0))
      )
        fail('DIRECTOR_CLIP_INVALID', '候选视频区间超出真实源时长。');
      if (
        validSource.sourceType === 'image' &&
        (media.sourceInMs !== null || media.sourceOutMs !== null)
      )
        fail('DIRECTOR_CLIP_INVALID', '图片不能伪造视频时间区间。');
    } else if (shot.media) fail('VISUAL_PLAN_REQUIRED', '只有已绑定路线可引用媒体。');
  }
  return { usedFrames: end, remainingFrames: doc.totalFrames - end };
}
export function directorTimingWarnings(
  s: WorkflowState,
  doc: DirectorDocument,
  shots: DirectorShot[],
) {
  const voice = voiceTimeline(s, doc.voiceRevisionId)!,
    cues = voiceCues(s, doc.voiceRevisionId);
  return shots.flatMap((shot) => {
    if (voice.mode === 'none') return [];
    const range = shotTime(shot, doc),
      selected = cues.filter((c) => shot.scriptSegmentIds.includes(c.segmentId) && !c.stale),
      issues: string[] = [];
    if (
      cues.some(
        (c) =>
          !c.stale &&
          c.startMs < range.endMs &&
          c.endMs > range.startMs &&
          !shot.scriptSegmentIds.includes(c.segmentId),
      )
    )
      issues.push('镜头时间包含未绑定的口播段落；请补齐所有相交段落。');
    if (
      shot.voiceCueAnchorIds.some(
        (id) =>
          !selected.some(
            (c) => c.anchorId === id && c.startMs < range.endMs && c.endMs > range.startMs,
          ),
      )
    )
      issues.push('所选锚点不与本镜头时间相交。');
    return issues.length ? [{ shotId: shot.shotId, issues }] : [];
  });
}
export function saveDirector(
  s: WorkflowState,
  r: WorkflowRevision,
  doc: DirectorDocument,
  shots: DirectorShot[],
) {
  validateDirector(s, doc, shots);
  for (const shot of shots) {
    const old = s.directorShots.find((x) => x.shotId === shot.shotId);
    if (old && s.revisions.find((x) => x.id === old.revisionId)?.artifactId !== r.artifactId)
      fail('DIRECTOR_ID_INVALID', '镜头身份属于其他产物。');
  }
  for (const row of s.directorShots.filter((x) => x.revisionId === r.id))
    row.removed = !shots.some((x) => x.shotId === row.shotId);
  for (const [order, shot] of shots.entries()) {
    const row = s.directorShots.find((x) => x.revisionId === r.id && x.shotId === shot.shotId);
    if (row) {
      row.order = order;
      row.value = shot;
      row.removed = false;
    } else
      s.directorShots.push({
        id: randomUUID(),
        revisionId: r.id,
        shotId: shot.shotId,
        order,
        value: shot,
        removed: false,
        schemaVersion: 1,
      });
  }
  const old = directorDocument(s, r.id);
  if (old) Object.assign(old, doc);
  else s.directorDocuments.push(doc);
  r.directorSchemaVersion = 1;
  r.text = `导演方案 · ${shots.length}镜头 · ${doc.totalFrames}帧/${doc.fps}FPS`;
}
export function initializeDirector(
  s: WorkflowState,
  r: WorkflowRevision,
  scriptId: string,
  voiceId: string,
  p: Project,
) {
  const voice = voiceTimeline(s, voiceId) ?? fail('VOICE_REQUIRED', '需选择真实结构化配音。');
  saveDirector(
    s,
    r,
    {
      id: randomUUID(),
      revisionId: r.id,
      schemaVersion: 1,
      scriptRevisionId: scriptId,
      voiceRevisionId: voiceId,
      researchRevisionId: scriptDocument(s, scriptId)?.researchRevisionId ?? null,
      fps: p.fps,
      durationMs: voice.durationMs,
      totalFrames: directorFrames(voice.durationMs, p.fps),
      provenance: 'user',
      needsRebind: false,
    },
    [],
  );
}
export function assertDirectorSubmittable(s: WorkflowState, r: WorkflowRevision) {
  const doc = directorDocument(s, r.id);
  if (!doc) return;
  const xs = directorShots(s, r.id),
    timing = validateDirector(s, doc, xs);
  if (!xs.length || timing.remainingFrames !== 0)
    fail('DIRECTOR_INCOMPLETE', '镜头必须完整覆盖批准时间轴，不能留下未分配尾段。');
  if (doc.needsRebind)
    fail('DIRECTOR_REBIND_REQUIRED', '输入修订已变化，请重新检查所有镜头并保存确认。');
  if (directorTimingWarnings(s, doc, xs).length)
    fail('DIRECTOR_TIMING_REFERENCE', '镜头与所选文稿/Cue时间不相交，先校正绑定。');
}
export function cloneDirector(s: WorkflowState, old: WorkflowRevision, next: WorkflowRevision) {
  const doc = directorDocument(s, old.id);
  if (!doc) return;
  const inputs = s.dependencies
    .filter((d) => d.downstreamRevisionId === next.id)
    .map((d) => s.revisions.find((r) => r.id === d.upstreamRevisionId)!);
  const scriptId =
      inputs.find((r) => r.scriptSchemaVersion)?.id ??
      fail('SCRIPT_REQUIRED', '导演依赖明确文稿。'),
    voiceId =
      inputs.find((r) => r.voiceSchemaVersion)?.id ?? fail('VOICE_REQUIRED', '导演依赖明确配音。');
  const voice = voiceTimeline(s, voiceId)!,
    changed = scriptId !== doc.scriptRevisionId || voiceId !== doc.voiceRevisionId;
  const copy = {
    ...structuredClone(doc),
    id: randomUUID(),
    revisionId: next.id,
    scriptRevisionId: scriptId,
    voiceRevisionId: voiceId,
    researchRevisionId: scriptDocument(s, scriptId)?.researchRevisionId ?? null,
    durationMs: voice.durationMs,
    totalFrames: directorFrames(voice.durationMs, doc.fps),
    needsRebind: changed,
  };
  // Reuse logical shot IDs when references/timebase remain valid; incompatible input requires explicit re-planning.
  const shots = structuredClone(directorShots(s, old.id));
  if (changed) {
    try {
      validateDirector(s, copy, shots);
    } catch {
      saveDirector(s, next, copy, []);
      return;
    }
  }
  saveDirector(s, next, copy, shots);
}
export function directorInput(
  s: WorkflowState,
  r: WorkflowRevision,
  p: Project,
  count: number,
  instruction: string,
  mode: DirectorJobInput['mode'],
): DirectorJobInput {
  const doc = directorDocument(s, r.id)!,
    xs = directorShots(s, r.id),
    sources = directorSources(s, doc.researchRevisionId);
  if (sources.some((x) => s.researchIndexes.filter((e) => e.sourceId === x.id).length > 100))
    fail('DIRECTOR_INPUT_LIMIT', '单来源索引超出100项；请缩小输入范围。');
  const input: DirectorJobInput = {
    schemaVersion: 1,
    revisionId: r.id,
    targetVersion: r.version,
    mode,
    instruction,
    document: structuredClone(doc),
    shotIds: Array.from({ length: count }, (_, i) => xs[i]?.shotId ?? randomUUID()),
    existingShots: xs,
    brief: {
      title: p.title,
      prompt: p.input.prompt,
      style: p.style,
      audience: p.audience,
      width: p.width,
      height: p.height,
      targetDurationMs: p.targetDurationMs,
    },
    segments: scriptSegments(s, doc.scriptRevisionId),
    voice: voiceTimeline(s, doc.voiceRevisionId)!,
    cues: voiceCues(s, doc.voiceRevisionId),
    subtitles: subtitleTrack(s, doc.voiceRevisionId)!.cues,
    facts: s.researchClaims
      .filter((c) => c.revisionId === doc.researchRevisionId)
      .map((c) => ({
        claimId: c.id,
        text: c.text,
        status: c.verificationStatus,
        caveats: c.caveats,
        sourceIds: [
          ...new Set(
            s.researchEvidence
              .filter((e) => e.claimId === c.id && sources.some((x) => x.id === e.sourceId))
              .map((e) => e.sourceId),
          ),
        ],
      })),
    sources: sources.map((x) => ({
      id: x.id,
      title: x.title,
      sourceType: x.sourceType,
      sourceUrl: x.sourceUrl ?? null,
      publisher: x.publisher,
      creator: x.creator,
      knownRestrictions: x.knownRestrictions,
      licenseStatus: x.licenseStatus,
      selected: x.selected,
      blobSha256: x.blob.sha256,
      metadata: x.metadata
        ? {
            ...(x.metadata.width ? { width: x.metadata.width } : {}),
            ...(x.metadata.height ? { height: x.metadata.height } : {}),
            ...(x.metadata.durationMs ? { durationMs: x.metadata.durationMs } : {}),
          }
        : null,
      indexes: s.researchIndexes
        .filter((e) => e.sourceId === x.id)
        .map((e) => ({
          id: e.id,
          summary: e.summary,
          ...(e.startMs !== undefined ? { startMs: e.startMs } : {}),
          ...(e.endMs !== undefined ? { endMs: e.endMs } : {}),
          provenance: e.provenance,
        })),
    })),
  };
  if (Buffer.byteLength(JSON.stringify(input)) > 750000)
    fail('DIRECTOR_INPUT_LIMIT', '导演输入超过750KB，需缩小资料/Cue范围；未静默截断。');
  return DirectorJobInputSchema.parse(input);
}
export function finishDirector(s: WorkflowState, input: DirectorJobInput, result: DirectorResult) {
  const r = s.revisions.find((r) => r.id === input.revisionId),
    doc = r && directorDocument(s, r.id);
  if (
    !r ||
    !doc ||
    r.status !== 'draft' ||
    r.version !== input.targetVersion ||
    !s.artifacts.some((a) => a.currentRevisionId === r.id)
  )
    return 'TARGET_CHANGED';
  if (
    result.mode !== input.mode ||
    result.shots.length !== input.shotIds.length ||
    new Set(result.shots.map((x) => x.shotId)).size !== input.shotIds.length ||
    result.shots.some((x) => !input.shotIds.includes(x.shotId))
  )
    return 'INVALID_DIRECTOR_RESULT';
  if (result.mode === 'real' && (!result.aiRun || result.aiRun.failureReason))
    return 'INVALID_DIRECTOR_RESULT';
  try {
    const next = { ...doc, provenance: result.mode, needsRebind: false };
    validateDirector(s, next, result.shots);
    if (result.shots.at(-1)!.endFrame !== doc.totalFrames) return 'DIRECTOR_INCOMPLETE';
    if (directorTimingWarnings(s, doc, result.shots).length) return 'DIRECTOR_TIMING_REFERENCE';
    saveDirector(s, r, next, result.shots);
  } catch (e) {
    return e instanceof AppError ? e.code : 'INVALID_DIRECTOR_RESULT';
  }
  r.mock = result.mode === 'mock';
  r.version++;
  return null;
}

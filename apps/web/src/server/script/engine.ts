import { randomUUID } from 'node:crypto';
import type { WorkflowState, WorkflowRevision } from '../../domain/workflow';
import {
  SegmentValueSchema,
  ScriptSegmentSchema,
  type ScriptSegment,
  type ScriptJobInput,
  type ScriptResult,
} from '../../domain/script';
import type { Project } from '../../domain/project';
import { AppError } from '../errors';
const fail = (code: string, message: string, status = 422): never => {
  throw new AppError(code, message, status);
};
export const scriptSegments = (s: WorkflowState, id: string): ScriptSegment[] =>
  s.scriptSegments
    .filter((x) => x.revisionId === id && !x.removed)
    .sort((a, b) => a.value.order - b.value.order)
    .map((x) => ({ id: x.segmentId, ...x.value }));
export const scriptDocument = (s: WorkflowState, id: string) =>
  s.scriptDocuments.find((x) => x.revisionId === id);
export function scriptContent(s: WorkflowState, r: WorkflowRevision) {
  const doc = scriptDocument(s, r.id);
  return doc ? { document: doc, segments: scriptSegments(s, r.id) } : r.text;
}
export function validateBindings(s: WorkflowState, r: WorkflowRevision, xs: ScriptSegment[]) {
  const doc = scriptDocument(s, r.id)!;
  for (const segment of xs)
    for (const binding of segment.factBindings) {
      const claim = s.researchClaims.find(
        (c) => c.id === binding.claimId && c.revisionId === doc.researchRevisionId,
      );
      if (
        !claim ||
        binding.sourceIds.some(
          (id) =>
            !s.researchEvidence.some(
              (e) =>
                e.claimId === claim.id &&
                e.sourceId === id &&
                e.revisionId === doc.researchRevisionId,
            ) ||
            !s.researchSources.some(
              (x) => x.id === id && x.revisionId === doc.researchRevisionId && x.selected,
            ),
        )
      )
        fail(
          'INVALID_SCRIPT_REFERENCE',
          'Claim/Source 必须来自该文稿固定的研究修订，且存在对应证据关系。',
        );
    }
}
export function saveScript(
  s: WorkflowState,
  r: WorkflowRevision,
  segments: ScriptSegment[],
  unitsPerMinute: number,
) {
  const doc = scriptDocument(s, r.id) ?? fail('NOT_FOUND', '尚未建立结构化文稿。', 404);
  validateBindings(s, r, segments);
  for (const segment of segments) {
    const used = s.scriptSegments.find((row) => row.segmentId === segment.id);
    if (used && s.revisions.find((v) => v.id === used.revisionId)?.artifactId !== r.artifactId)
      fail('INVALID_SEGMENT_ID', '段落 ID 属于其他文稿。');
  }
  const old = s.scriptSegments.filter((x) => x.revisionId === r.id);
  for (const row of old) row.removed = !segments.some((x) => x.id === row.segmentId);
  for (const [order, raw] of segments.entries()) {
    const x = ScriptSegmentSchema.parse(raw);
    const used = s.scriptSegments.find((row) => row.segmentId === x.id);
    if (used && s.revisions.find((v) => v.id === used.revisionId)?.artifactId !== r.artifactId)
      fail('INVALID_SEGMENT_ID', '段落 ID 属于其他文稿。');
    const { id, ...body } = x,
      value = SegmentValueSchema.parse({ ...body, order });
    const row = old.find((v) => v.segmentId === id);
    if (row) {
      row.value = value;
      row.removed = false;
    } else
      s.scriptSegments.push({
        id: randomUUID(),
        revisionId: r.id,
        segmentId: id,
        value,
        removed: false,
        schemaVersion: 1,
      });
  }
  doc.unitsPerMinute = unitsPerMinute;
  r.text =
    segments
      .map((x) => x.text)
      .join('\n\n')
      .trim() || '空文稿草稿（尚无段落）';
}
export function initializeScript(
  s: WorkflowState,
  r: WorkflowRevision,
  origin: 'user_provided' | 'research' | 'legacy',
  researchRevisionId: string | null,
  text: string,
  unitsPerMinute: number,
) {
  r.scriptSchemaVersion = 1;
  s.scriptDocuments.push({
    id: randomUUID(),
    revisionId: r.id,
    schemaVersion: 1,
    origin,
    researchRevisionId,
    unitsPerMinute,
    provenance: r.mock ? 'mock' : 'user',
  });
  const parts = text.trim() ? text.trim().split(/\n\s*\n/) : [];
  saveScript(
    s,
    r,
    parts.map((text, i) =>
      ScriptSegmentSchema.parse({
        id: randomUUID(),
        text,
        purpose: i === 0 ? 'hook' : i === parts.length - 1 ? 'conclusion' : 'explanation',
      }),
    ),
    unitsPerMinute,
  );
}
export function cloneScript(s: WorkflowState, old: WorkflowRevision, next: WorkflowRevision) {
  const doc = scriptDocument(s, old.id);
  if (!doc) return;
  const newResearch = s.dependencies
    .filter((d) => d.downstreamRevisionId === next.id)
    .map((d) => s.revisions.find((r) => r.id === d.upstreamRevisionId))
    .find((r) => s.artifacts.find((a) => a.id === r?.artifactId)?.type === 'research');
  const id = newResearch?.id ?? null,
    changed = id !== doc.researchRevisionId;
  next.scriptSchemaVersion = 1;
  s.scriptDocuments.push({
    ...structuredClone(doc),
    id: randomUUID(),
    revisionId: next.id,
    researchRevisionId: id,
    origin: id ? 'research' : doc.origin,
  });
  const xs = scriptSegments(s, old.id).map((x) =>
    changed && x.factBindings.length ? { ...x, factBindings: [], needsRebind: true } : x,
  );
  saveScript(s, next, xs, doc.unitsPerMinute);
}
export function scriptInput(
  s: WorkflowState,
  r: WorkflowRevision,
  p: Project,
  segmentId: string | undefined,
  instruction: string,
  mode: ScriptJobInput['mode'],
): ScriptJobInput {
  const doc = scriptDocument(s, r.id) ?? fail('NOT_FOUND', '请先创建结构化文稿。', 404),
    segments = scriptSegments(s, r.id);
  if (segmentId && !segments.some((x) => x.id === segmentId))
    fail('NOT_FOUND', '目标段落不存在。', 404);
  return {
    schemaVersion: 1,
    revisionId: r.id,
    targetVersion: r.version,
    researchRevisionId: doc.researchRevisionId,
    segmentId,
    instruction,
    mode,
    brief: {
      prompt: p.input.prompt,
      targetDurationMs: p.targetDurationMs,
      language: p.language,
      audience: p.audience,
      style: p.style,
    },
    segments,
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
              .filter(
                (e) =>
                  e.claimId === c.id &&
                  s.researchSources.some((x) => x.id === e.sourceId && x.selected),
              )
              .map((e) => e.sourceId),
          ),
        ],
      })),
  };
}
export function finishScript(s: WorkflowState, input: ScriptJobInput, result: ScriptResult) {
  const r = s.revisions.find((r) => r.id === input.revisionId);
  if (
    !r ||
    r.status !== 'draft' ||
    r.version !== input.targetVersion ||
    !s.artifacts.some((a) => a.currentRevisionId === r.id)
  )
    return 'TARGET_CHANGED';
  if (result.mode !== input.mode) return 'INVALID_SCRIPT_RESULT';
  let xs = result.segments;
  if (input.segmentId) {
    if (xs.length !== 1 || xs[0].id !== input.segmentId) return 'INVALID_SCRIPT_RESULT';
    xs = scriptSegments(s, r.id).map((x) => (x.id === input.segmentId ? xs[0] : x));
  } else if (input.segments.some((x) => !xs.some((y) => y.id === x.id)))
    return 'INVALID_SCRIPT_RESULT';
  try {
    saveScript(s, r, xs, scriptDocument(s, r.id)!.unitsPerMinute);
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  scriptDocument(s, r.id)!.provenance = result.mode;
  r.mock = result.mode === 'mock';
  r.version++;
  return null;
}
export function sameScopedScript(s: WorkflowState, oldId: string, nextId: string, ids: string[]) {
  const a = scriptDocument(s, oldId),
    b = scriptDocument(s, nextId);
  if (!a || !b || a.unitsPerMinute !== b.unitsPerMinute) return false;
  const old = scriptSegments(s, oldId),
    next = scriptSegments(s, nextId);
  return ids.every((id) => {
    const x = old.find((x) => x.id === id),
      y = next.find((x) => x.id === id);
    if (!x || !y) return false;
    const { order: _a, ...left } = x,
      { order: _b, ...right } = y;
    return JSON.stringify(left) === JSON.stringify(right);
  });
}
export function assertScriptSubmittable(s: WorkflowState, r: WorkflowRevision) {
  if (!r.scriptSchemaVersion) return;
  const xs = scriptSegments(s, r.id);
  if (!xs.length || xs.some((x) => !x.text.trim() || x.needsRebind))
    fail('INCOMPLETE_SCRIPT', '文稿需要非空正文，且替换研究后的引用必须重新确认。');
  validateBindings(s, r, xs);
}

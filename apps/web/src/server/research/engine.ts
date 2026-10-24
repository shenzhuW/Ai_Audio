import { randomUUID } from 'node:crypto';
import type { WorkflowState, WorkflowRevision } from '../../domain/workflow';
import {
  ResearchCommandSchema,
  type ResearchCommand,
  type ResearchJobInput,
  type ResearchResult,
} from '../../domain/research';
import { AppError } from '../errors';
import { claimInput, validateClaimInput, groundCandidates } from './claim-candidates';
const fail = (code: string, message: string, status = 422): never => {
  throw new AppError(code, message, status);
};
export function researchContent(s: WorkflowState, r: WorkflowRevision) {
  if (!r.researchSchemaVersion) return r.text;
  const rows = (xs: { id: string; revisionId: string }[]) =>
    xs.filter((x) => x.revisionId === r.id).sort((a, b) => a.id.localeCompare(b.id));
  return {
    text: r.text,
    sources: rows(s.researchSources),
    claims: rows(s.researchClaims),
    evidence: rows(s.researchEvidence),
    indexes: rows(s.researchIndexes),
  };
}
export function cloneResearch(s: WorkflowState, old: WorkflowRevision, next: WorkflowRevision) {
  if (!old.researchSchemaVersion) return;
  next.researchSchemaVersion = 1;
  const sourceIds = new Map<string, string>(),
    claimIds = new Map<string, string>();
  for (const source of s.researchSources.filter((x) => x.revisionId === old.id)) {
    const id = randomUUID();
    sourceIds.set(source.id, id);
    s.researchSources.push({ ...structuredClone(source), id, revisionId: next.id });
  }
  for (const claim of s.researchClaims.filter((x) => x.revisionId === old.id)) {
    const id = randomUUID();
    claimIds.set(claim.id, id);
    s.researchClaims.push({ ...structuredClone(claim), id, revisionId: next.id });
  }
  for (const evidence of s.researchEvidence.filter((x) => x.revisionId === old.id))
    s.researchEvidence.push({
      ...structuredClone(evidence),
      id: randomUUID(),
      revisionId: next.id,
      sourceId: sourceIds.get(evidence.sourceId)!,
      claimId: claimIds.get(evidence.claimId)!,
    });
  for (const entry of s.researchIndexes.filter((x) => x.revisionId === old.id))
    s.researchIndexes.push({
      ...structuredClone(entry),
      id: randomUUID(),
      revisionId: next.id,
      sourceId: sourceIds.get(entry.sourceId)!,
    });
}
function validateLocator(s: WorkflowState, e: WorkflowState['researchEvidence'][number]) {
  const source =
    s.researchSources.find((x) => x.id === e.sourceId && x.revisionId === e.revisionId) ??
    fail('NOT_FOUND', '引用来源不属于此修订。', 404);
  const l = e.locator;
  if (
    l.kind === 'time' &&
    (source.sourceType !== 'video' ||
      !source.metadata?.durationMs ||
      l.endMs > source.metadata.durationMs)
  )
    fail('INVALID_LOCATOR', '视频引用需要已分析的原视频有效时间范围。');
  if (
    l.kind === 'page' &&
    (source.sourceType !== 'pdf' || !source.metadata?.pages || l.page > source.metadata.pages)
  )
    fail('INVALID_LOCATOR', 'PDF 引用页码超出实际页数，或尚未提取页数。');
  if (l.kind === 'image' && source.sourceType !== 'image')
    fail('INVALID_LOCATOR', '图片引用必须指向图片。');
  const normalize = (x: string) => x.replace(/\s+/g, ' ').trim();
  const entries = s.researchIndexes.filter(
    (x) =>
      x.sourceId === e.sourceId &&
      x.revisionId === e.revisionId &&
      (l.kind !== 'page' || x.page === l.page),
  );
  e.validation = entries.some(
    (x) =>
      x.provenance === 'real' &&
      x.extractedText &&
      normalize(x.extractedText).includes(normalize(e.quote)),
  )
    ? 'matched'
    : entries.some((x) => x.provenance === 'mock')
      ? 'mock'
      : 'unvalidated';
}
function reconcileClaim(s: WorkflowState, id: string) {
  const claim = s.researchClaims.find((x) => x.id === id)!;
  const evidence = s.researchEvidence.filter(
    (x) => x.claimId === id && s.researchSources.some((a) => a.id === x.sourceId && a.selected),
  );
  if (claim.verificationStatus === 'withdrawn') return;
  if (evidence.some((x) => x.role === 'support') && evidence.some((x) => x.role === 'refute'))
    claim.verificationStatus = 'conflicting';
  else if (
    claim.verificationStatus === 'supported' &&
    !evidence.some((x) => x.role === 'support' && x.validation === 'matched')
  )
    claim.verificationStatus = 'unverified';
}
export function applyResearchCommand(
  s: WorkflowState,
  projectId: string,
  raw: ResearchCommand,
  time: string,
): { entity?: { id: string }; input?: ResearchJobInput; revision: WorkflowRevision } {
  const c = ResearchCommandSchema.parse(raw),
    r =
      s.revisions.find((x) => x.id === c.revisionId) ?? fail('NOT_FOUND', '研究修订不存在。', 404);
  const a = s.artifacts.find((x) => x.id === r.artifactId)!;
  if (a.type !== 'research') fail('INVALID_STATE', '此操作仅适用于研究修订。');
  if (r.status !== 'draft') fail('IMMUTABLE_REVISION', '研究实体仅草稿可改；请创建新修订。');
  if (r.version !== c.expectedVersion || a.currentRevisionId !== r.id)
    fail('REVISION_CONFLICT', '研究修订已变化，请重新载入。', 409);
  const source = (id: string) =>
    s.researchSources.find((x) => x.id === id && x.revisionId === r.id) ??
    fail('NOT_FOUND', '该来源不属于此研究修订。', 404);
  const claim = (id: string) =>
    s.researchClaims.find((x) => x.id === id && x.revisionId === r.id) ??
    fail('NOT_FOUND', '该 Claim 不属于此研究修订。', 404);
  if (c.action === 'research-analyze')
    return {
      revision: r,
      input: {
        kind: 'analyze',
        revisionId: r.id,
        sourceId: source(c.sourceId).id,
        blob: structuredClone(source(c.sourceId).blob),
        mode: c.mode,
        ...(c.vision ? { vision: true } : {}),
      },
    };
  if (c.action === 'research-search')
    return {
      revision: r,
      input: { kind: 'search', revisionId: r.id, query: c.query, mode: c.mode },
    };
  if (c.action === 'research-claims') return { revision: r, input: claimInput(s, r) };
  let entity: { id: string };
  if (c.action === 'research-candidate-review') {
    const job =
      s.jobs.find(
        (x) =>
          x.id === c.jobId &&
          x.state === 'succeeded' &&
          x.researchInput?.kind === 'claims' &&
          x.researchInput.revisionId === r.id &&
          x.researchResult?.kind === 'claims',
      ) ?? fail('INVALID_CANDIDATE_JOB', '候选任务不属于当前研究修订，或尚未成功。');
    const input = job.researchInput,
      output = job.researchResult;
    if (input?.kind !== 'claims' || output?.kind !== 'claims')
      throw new AppError('INVALID_CANDIDATE_JOB', '候选任务类型不符。', 422);
    const original =
      output.candidates.find((x) => x.id === c.candidateId) ??
      fail('NOT_FOUND', '候选不存在。', 404);
    const reviews = (job.claimCandidateReviews ??= []),
      previous = reviews.find((x) => x.candidateId === c.candidateId);
    if (previous && previous.state !== 'pending')
      fail('CANDIDATE_ALREADY_REVIEWED', '候选已接受或拒绝，不可重复操作。', 409);
    // Reject remains possible if a source was deselected; edit/accept must still match original bytes.
    if (c.decision !== 'reject') validateClaimInput(s, input);
    const candidate =
      c.decision === 'reject'
        ? (previous?.candidate ?? original)
        : groundCandidates(input, [
            { ...(c.candidate ?? previous?.candidate ?? original), id: original.id },
          ])[0];
    const row: NonNullable<typeof job.claimCandidateReviews>[number] = {
      id: previous?.id ?? randomUUID(),
      candidateId: original.id,
      candidate,
      state: c.decision === 'edit' ? 'pending' : c.decision === 'accept' ? 'accepted' : 'rejected',
      version: (previous?.version ?? 0) + 1,
      updatedAt: time,
      actor: 'local-user',
    };
    if (c.decision === 'accept') {
      const accepted = {
        ...candidate.claim,
        id: randomUUID(),
        revisionId: r.id,
        schemaVersion: 1 as const,
      };
      s.researchClaims.push(accepted);
      row.acceptedClaimId = accepted.id;
      row.acceptedEvidenceIds = candidate.evidence.map((e) => {
        const evidence = {
          id: randomUUID(),
          revisionId: r.id,
          schemaVersion: 1 as const,
          claimId: accepted.id,
          sourceId: e.sourceId,
          role: e.role,
          quote: e.quote,
          locator: e.match!.locator,
          validation: 'matched' as const,
        };
        validateLocator(s, evidence);
        s.researchEvidence.push(evidence);
        return evidence.id;
      });
      reconcileClaim(s, accepted.id);
    }
    if (previous) reviews[reviews.indexOf(previous)] = row;
    else reviews.push(row);
    job.version++;
    job.updatedAt = time;
    entity = row;
  } else if (c.action === 'research-source') {
    if (s.researchSources.filter((x) => x.revisionId === r.id).length >= 100)
      fail('RESEARCH_LIMIT', '单个研究修订最多 100 个来源。', 429);
    const kind = c.source.blob.mime.startsWith('image/')
      ? 'image'
      : c.source.blob.mime === 'video/mp4'
        ? 'video'
        : c.source.blob.mime === 'application/pdf'
          ? 'pdf'
          : 'text';
    if (kind !== c.source.sourceType) fail('INVALID_FILE', '来源类型与原件类型不符。');
    const row = {
      ...c.source,
      id: randomUUID(),
      projectId,
      revisionId: r.id,
      schemaVersion: 1 as const,
      retrievedAt: time,
      selected: true,
      provenance: 'user-upload' as const,
      urlStatus: 'user_supplied' as const,
    };
    s.researchSources.push(row);
    entity = row;
  } else if (c.action === 'research-source-edit') {
    const row = source(c.sourceId);
    row.selected = c.selected;
    if (c.knownRestrictions !== undefined) row.knownRestrictions = c.knownRestrictions;
    for (const claim of s.researchClaims.filter((x) => x.revisionId === r.id))
      reconcileClaim(s, claim.id);
    entity = row;
  } else if (c.action === 'research-claim') {
    const row = c.claimId
      ? claim(c.claimId)
      : { id: randomUUID(), revisionId: r.id, schemaVersion: 1 as const, ...c.claim };
    if (
      c.claim.verificationStatus === 'supported' &&
      !s.researchEvidence.some(
        (x) =>
          x.claimId === row.id &&
          x.role === 'support' &&
          x.validation === 'matched' &&
          source(x.sourceId).selected,
      )
    )
      fail('EVIDENCE_REQUIRED', '需要能定位到真实原件文本的支持引用；有引用仍不等于已核实。');
    if (
      c.claim.verificationStatus === 'conflicting' &&
      !s.researchEvidence.some((x) => x.claimId === row.id && x.role === 'refute')
    )
      fail('EVIDENCE_REQUIRED', '请添加反驳/冲突证据，再标注冲突。');
    Object.assign(row, c.claim);
    if (!c.claimId) s.researchClaims.push(row);
    reconcileClaim(s, row.id);
    entity = row;
  } else {
    claim(c.claimId);
    source(c.sourceId);
    const row = c.evidenceId
      ? (s.researchEvidence.find((x) => x.id === c.evidenceId && x.revisionId === r.id) ??
        fail('NOT_FOUND', '该引用不属于此研究修订。', 404))
      : {
          id: randomUUID(),
          schemaVersion: 1 as const,
          revisionId: r.id,
          validation: 'unvalidated' as const,
          claimId: c.claimId,
          sourceId: c.sourceId,
          role: c.role,
          quote: c.quote,
          locator: c.locator,
        };
    const oldClaim = row.claimId;
    Object.assign(row, {
      claimId: c.claimId,
      sourceId: c.sourceId,
      role: c.role,
      quote: c.quote,
      locator: c.locator,
    });
    validateLocator(s, row);
    if (!c.evidenceId) s.researchEvidence.push(row);
    reconcileClaim(s, oldClaim);
    reconcileClaim(s, row.claimId);
    entity = row;
  }
  r.researchSchemaVersion = 1;
  r.version++;
  r.updatedAt = time;
  a.version++;
  return { entity, revision: r };
}
export function finishResearch(
  s: WorkflowState,
  input: ResearchJobInput,
  result: ResearchResult,
  time: string,
): string | null {
  const r = s.revisions.find((x) => x.id === input.revisionId),
    a = s.artifacts.find((x) => x.id === r?.artifactId);
  if (!r || r.status !== 'draft' || a?.currentRevisionId !== r.id) return 'TARGET_CHANGED';
  if (input.kind !== result.kind || input.mode !== result.mode) return 'INVALID_RESULT';
  if (input.kind === 'claims' && result.kind === 'claims') {
    if (r.version !== input.targetVersion) return 'TARGET_CHANGED';
    if (result.candidates.length && !result.aiRuns.length) return 'INVALID_RESULT';
    try {
      validateClaimInput(s, input);
      result.candidates = groundCandidates(input, result.candidates);
      return null;
    } catch (e) {
      return e instanceof AppError ? e.code : 'INVALID_RESULT';
    }
  }
  if (input.kind === 'search' && result.kind === 'search') {
    if (result.mode === 'mock' && result.candidates.length) return 'INVALID_RESULT';
    const fetched = result.candidates.filter((x) => x.fetchStatus === 'fetched');
    if (fetched.some((c) => !c.source || !c.extractedText || c.source.sourceUrl !== c.url))
      return 'INVALID_RESULT';
    if (s.researchSources.filter((x) => x.revisionId === r.id).length + fetched.length > 100)
      return 'RESEARCH_LIMIT';
    for (const candidate of fetched) {
      if (s.researchSources.some((x) => x.revisionId === r.id && x.sourceUrl === candidate.url))
        continue;
      const source = {
        ...candidate.source!,
        id: randomUUID(),
        projectId: a.projectId,
        revisionId: r.id,
        schemaVersion: 1 as const,
        retrievedAt: time,
        selected: true,
        provenance: 'web-fetch' as const,
        urlStatus: 'fetched' as const,
      };
      s.researchSources.push(source);
      s.researchIndexes.push({
        id: randomUUID(),
        revisionId: r.id,
        sourceId: source.id,
        schemaVersion: 1,
        contentType: 'text',
        provenance: 'real',
        keywords: [],
        summary: '独立受限获取器提取的网页文本；模型摘要单独保存，事实未独立核实。',
        extractedText: candidate.extractedText,
      });
    }
    r.researchSchemaVersion = 1;
    r.version++;
    r.updatedAt = time;
    a.version++;
    return null;
  }
  if (input.kind !== 'analyze' || result.kind !== 'analyze') return 'INVALID_RESULT';
  const source = s.researchSources.find((x) => x.id === input.sourceId && x.revisionId === r.id);
  if (
    !source ||
    source.blob.sha256 !== input.blob.sha256 ||
    result.metadata.sha256 !== input.blob.sha256 ||
    result.metadata.sizeBytes !== input.blob.sizeBytes ||
    result.metadata.mime !== input.blob.mime
  )
    return 'INVALID_RESULT';
  if (s.researchIndexes.some((x) => x.sourceId === source.id && (!input.vision || x.analysis)))
    return 'ANALYSIS_EXISTS';
  for (const entry of result.entries) {
    if (entry.provenance !== result.mode) return 'INVALID_RESULT';
    if (
      entry.endMs !== undefined &&
      (!result.metadata.durationMs || entry.endMs > result.metadata.durationMs)
    )
      return 'INVALID_RESULT';
    if (entry.page !== undefined && (!result.metadata.pages || entry.page > result.metadata.pages))
      return 'INVALID_RESULT';
    if (
      entry.frameRefs?.some(
        (f) => f.timeMs < (entry.startMs ?? 0) || f.timeMs >= (entry.endMs ?? 0),
      )
    )
      return 'INVALID_RESULT';
  }
  source.metadata = result.metadata;
  for (const entry of result.entries)
    s.researchIndexes.push({
      ...entry,
      id: randomUUID(),
      revisionId: r.id,
      sourceId: source.id,
      schemaVersion: 1,
    });
  for (const evidence of s.researchEvidence.filter((x) => x.revisionId === r.id))
    validateLocator(s, evidence);
  r.researchSchemaVersion = 1;
  r.version++;
  r.updatedAt = time;
  a.version++;
  return null;
}

import { createHash } from 'node:crypto';
import type { WorkflowState, WorkflowRevision } from '../../domain/workflow';
import {
  ClaimCandidateSchema,
  type ClaimCandidate,
  type ClaimPassage,
  type ResearchJobInput,
} from '../../domain/research';
import { AppError } from '../errors';

type Input = Extract<ResearchJobInput, { kind: 'claims' }>;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const fail = (code: string, message: string): never => {
  throw new AppError(code, message, 422);
};
export function claimInput(s: WorkflowState, r: WorkflowRevision): Input {
  const passages: ClaimPassage[] = [],
    warnings: string[] = [];
  let remaining = 60000,
    omitted = 0,
    truncated = 0;
  for (const entry of [...s.researchIndexes].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = s.researchSources.find(
      (x) => x.id === entry.sourceId && x.revisionId === r.id && x.selected,
    );
    if (!source || entry.revisionId !== r.id || !eligible(entry, source)) continue;
    if (!remaining || passages.length === 20) {
      omitted++;
      continue;
    }
    const text = entry.extractedText!.slice(0, Math.min(12000, remaining));
    if (text.length < entry.extractedText!.length) truncated++;
    remaining -= text.length;
    passages.push({
      sourceId: source.id,
      indexId: entry.id,
      title: source.title,
      ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
      sourceSha256: source.blob.sha256,
      indexTextSha256: sha(entry.extractedText!),
      text,
      ...(entry.page ? { page: entry.page } : {}),
    });
  }
  if (omitted || truncated)
    warnings.push(
      `原文预算：最多20段，每段12000字符，总计60000字符；省略${omitted}段，截断${truncated}段。候选不代表完整资料核验。`,
    );
  if (!passages.length)
    warnings.push(
      '缺少已选中来源的真实提取文本。搜索摘要、抓取失败结果、Mock 及视觉描述不能作为原文证据。',
    );
  return {
    kind: 'claims',
    revisionId: r.id,
    targetVersion: r.version,
    mode: 'real',
    passages,
    warnings,
  };
}
function eligible(
  entry: WorkflowState['researchIndexes'][number],
  source: WorkflowState['researchSources'][number],
) {
  return (
    entry.provenance === 'real' &&
    !entry.analysis &&
    !!entry.extractedText?.trim() &&
    ((source.sourceType === 'text' && entry.contentType === 'text') ||
      (source.sourceType === 'pdf' && entry.contentType === 'pdf_page' && !!entry.page))
  );
}
export function validateClaimInput(s: WorkflowState, input: Input) {
  for (const p of input.passages) {
    const source = s.researchSources.find(
      (x) => x.id === p.sourceId && x.revisionId === input.revisionId && x.selected,
    );
    const entry = s.researchIndexes.find(
      (x) => x.id === p.indexId && x.sourceId === p.sourceId && x.revisionId === input.revisionId,
    );
    if (
      !source ||
      !entry ||
      !eligible(entry, source) ||
      source.blob.sha256 !== p.sourceSha256 ||
      sha(entry.extractedText!) !== p.indexTextSha256 ||
      entry.page !== p.page ||
      !entry.extractedText!.startsWith(p.text)
    )
      throw new AppError(
        'CANDIDATE_INPUT_CHANGED',
        '候选依赖的原文或来源选择已变化，请重新生成。',
        409,
      );
  }
}
// Exact substring matching only. Model-supplied offsets/hashes are always discarded and recomputed.
export function groundCandidates(input: Input, candidates: ClaimCandidate[]): ClaimCandidate[] {
  if (new Set(candidates.map((x) => x.id)).size !== candidates.length)
    fail('INVALID_RESULT', '候选 ID 重复。');
  return candidates.map((raw) => {
    const candidate = ClaimCandidateSchema.parse(raw);
    return {
      ...candidate,
      evidence: candidate.evidence.map((e) => {
        const p =
          input.passages.find((x) => x.sourceId === e.sourceId && x.indexId === e.indexId) ??
          fail('INVALID_CANDIDATE_SOURCE', '引用必须属于本任务固定的当前研究原文。');
        const startChar = p.text.indexOf(e.quote);
        if (startChar < 0)
          fail('INVALID_CLAIM_QUOTE', '引用不是原文中的精确连续文本，请核对原件。');
        const endChar = startChar + e.quote.length,
          label = `${p.indexId} · UTF-16 ${startChar}–${endChar}`;
        return {
          ...e,
          match: {
            startChar,
            endChar,
            sourceSha256: p.sourceSha256,
            indexTextSha256: p.indexTextSha256,
            locator: p.page
              ? { kind: 'page' as const, page: p.page, label }
              : { kind: 'text' as const, label },
          },
        };
      }),
    };
  });
}

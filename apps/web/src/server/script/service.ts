import { z } from 'zod';
import type { WorkflowRepository } from '../workflow/repository';
import { workflow } from '../workflow';
import { staleRevisions } from '../workflow/engine';
import { scriptDocument, scriptSegments, sameScopedScript } from './engine';
import { scriptDiff, estimateScript } from '../../domain/script';
import { AppError } from '../errors';
export function createScriptService(repo: WorkflowRepository) {
  return {
    async read(projectId: string, owner: string, revisionId?: string, compareId?: string) {
      z.uuid().parse(projectId);
      if (revisionId) z.uuid().parse(revisionId);
      if (compareId) z.uuid().parse(compareId);
      const { state: s, project } = await repo.transaction(projectId, owner);
      const a = s.artifacts.find((a) => a.type === 'script'),
        research = s.artifacts.find((a) => a.type === 'research');
      const revisions = s.revisions
        .filter((r) => r.artifactId === a?.id)
        .sort((a, b) => b.revisionNumber - a.revisionNumber);
      const r = revisions.find((r) => r.id === (revisionId ?? a?.currentRevisionId)) ?? null;
      if (revisionId && !r) throw new AppError('NOT_FOUND', '找不到此文稿修订。', 404);
      const compare = compareId ?? r?.parentRevisionId;
      if (compare && !revisions.some((r) => r.id === compare))
        throw new AppError('NOT_FOUND', '对比修订不属于此文稿。', 404);
      const doc = r ? (scriptDocument(s, r.id) ?? null) : null,
        xs = r ? scriptSegments(s, r.id) : [];
      const researchRevisionId = doc?.researchRevisionId ?? null;
      const bound = s.revisions.find((r) => r.id === researchRevisionId) ?? null;
      const stale = staleRevisions(s);
      const availableResearch =
        s.revisions.find((r) => r.id === research?.approvedRevisionId && !stale.has(r.id)) ?? null;
      const researchChanged = !!researchRevisionId && availableResearch?.id !== researchRevisionId;
      const claims = s.researchClaims.filter((c) => c.revisionId === researchRevisionId);
      const sources = s.researchSources.filter((c) => c.revisionId === researchRevisionId);
      const evidence = s.researchEvidence.filter((c) => c.revisionId === researchRevisionId);
      const warnings = xs.flatMap((segment) => {
        const notes: string[] = [];
        if (!segment.factBindings.length) notes.push('未绑定研究事实；用户内容未独立核实。');
        if (segment.needsRebind) notes.push('研究输入已替换，请重新核对并绑定引用。');
        if (researchChanged && segment.factBindings.length)
          notes.push('当前批准研究已替换；此段保留旧版事实快照，需检查。');
        for (const b of segment.factBindings) {
          const c = claims.find((c) => c.id === b.claimId);
          if (c)
            notes.push(
              c.verificationStatus === 'conflicting'
                ? '引用存在冲突证据，请保留双方说明。'
                : c.verificationStatus === 'withdrawn'
                  ? '引用的 Claim 已作废。'
                  : c.verificationStatus === 'supported'
                    ? '引用有原文支持，但未独立事实核验。'
                    : '引用的 Claim 未核实。',
            );
          if (!b.sourceIds.length) notes.push('该 Claim 尚无选用的具体来源。');
        }
        return notes.length ? [{ segmentId: segment.id, notes: [...new Set(notes)] }] : [];
      });
      return {
        projectId,
        currentRevisionId: a?.currentRevisionId ?? null,
        revision: r,
        document: doc,
        segments: xs,
        revisions,
        brief: {
          targetDurationMs: project.targetDurationMs,
          language: project.language,
          entryType: project.input.entryType,
          originalScript: project.input.entryType === 'script' ? project.input.prompt : '',
        },
        timing: estimateScript(
          xs,
          doc?.unitsPerMinute ?? (project.language.startsWith('zh') ? 240 : 150),
          project.targetDurationMs,
        ),
        research: {
          boundRevision: bound,
          approvedRevision: availableResearch,
          changed: researchChanged,
          claims,
          sources,
          evidence,
        },
        warnings,
        comparisonRevisionId: compare ?? null,
        diff: r && compare ? scriptDiff(scriptSegments(s, compare), xs) : [],
        impact: {
          stale: !!r && stale.has(r.id),
          researchAffectedSegmentIds: researchChanged
            ? xs.filter((x) => x.factBindings.length).map((x) => x.id)
            : [],
          downstream: s.dependencies
            .filter((d) => revisions.some((v) => v.id === d.upstreamRevisionId))
            .map((d) => ({
              revisionId: d.downstreamRevisionId,
              upstreamRevisionId: d.upstreamRevisionId,
              segmentIds: d.segmentIds ?? null,
              stale: stale.has(d.downstreamRevisionId),
              wouldBeStale:
                !!r &&
                r.id !== d.upstreamRevisionId &&
                (!d.segmentIds || !sameScopedScript(s, d.upstreamRevisionId, r.id, d.segmentIds)),
            })),
        },
        jobs: s.jobs.filter((j) => j.kind === 'script'),
        providers: [
          { id: 'script-model', mode: 'unconfigured', configured: false },
          { id: 'explicit-script-fixture', mode: 'mock', configured: true },
        ],
      };
    },
  };
}
export async function script() {
  await workflow();
  return createScriptService(
    await (globalThis as { studioWorkflow?: Promise<WorkflowRepository> }).studioWorkflow!,
  );
}
export type ScriptWorkspace = Awaited<ReturnType<ReturnType<typeof createScriptService>['read']>>;

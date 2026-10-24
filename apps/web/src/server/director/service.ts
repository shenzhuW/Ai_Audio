import { z } from 'zod';
import type { WorkflowRepository } from '../workflow/repository';
import { workflow } from '../workflow';
import { staleRevisions, fingerprint } from '../workflow/engine';
import {
  directorDocument,
  directorShots,
  directorSources,
  directorTimingWarnings,
  validateDirector,
} from './engine';
import { scriptSegments } from '../script/engine';
import { voiceTimeline, voiceCues, subtitleTrack } from '../voice/engine';
import { codexConfigured } from '../ai/codex';
import { AppError } from '../errors';
export function createDirectorService(repo: WorkflowRepository) {
  return {
    async read(projectId: string, owner: string, revisionId?: string) {
      z.uuid().parse(projectId);
      if (revisionId) z.uuid().parse(revisionId);
      const { state: s, project } = await repo.transaction(projectId, owner),
        a = s.artifacts.find((a) => a.type === 'storyboard'),
        stale = staleRevisions(s);
      const revisions = s.revisions
          .filter((r) => r.artifactId === a?.id)
          .sort((a, b) => b.revisionNumber - a.revisionNumber),
        revision = revisions.find((r) => r.id === (revisionId ?? a?.currentRevisionId)) ?? null;
      if (revisionId && !revision) throw new AppError('NOT_FOUND', '导演修订不存在。', 404);
      const document = revision ? (directorDocument(s, revision.id) ?? null) : null,
        shots = revision ? directorShots(s, revision.id) : [];
      const approved = (type: string) => {
        const a = s.artifacts.find((a) => a.type === type);
        return s.revisions.find((r) => r.id === a?.approvedRevisionId && !stale.has(r.id)) ?? null;
      };
      const script = approved('script'),
        voice = approved('voice'),
        availableInputs =
          script?.scriptSchemaVersion &&
          voice?.voiceSchemaVersion &&
          voiceTimeline(s, voice.id)?.scriptRevisionId === script.id
            ? { scriptRevisionId: script.id, voiceRevisionId: voice.id }
            : null;
      const parent = revision?.parentRevisionId
        ? directorShots(s, revision.parentRevisionId)
        : null;
      const timing = document ? validateDirector(s, document, shots) : null;
      return {
        projectId,
        currentRevisionId: a?.currentRevisionId ?? null,
        revision,
        revisions,
        document,
        shots,
        availableInputs,
        segments: document ? scriptSegments(s, document.scriptRevisionId) : [],
        voice: document ? voiceTimeline(s, document.voiceRevisionId) : null,
        cues: document ? voiceCues(s, document.voiceRevisionId) : [],
        subtitles: document ? (subtitleTrack(s, document.voiceRevisionId)?.cues ?? []) : [],
        sources: document ? directorSources(s, document.researchRevisionId) : [],
        claims: document
          ? s.researchClaims.filter((c) => c.revisionId === document.researchRevisionId)
          : [],
        evidence: document
          ? s.researchEvidence.filter((e) => e.revisionId === document.researchRevisionId)
          : [],
        timing,
        warnings: document ? directorTimingWarnings(s, document, shots) : [],
        provider: { id: 'codex-cli', mode: codexConfigured() ? 'real' : 'unconfigured' },
        brief: {
          width: project.width,
          height: project.height,
          targetDurationMs: project.targetDurationMs,
        },
        impact: {
          stale: !!revision && stale.has(revision.id),
          scriptChanged: !!document && script?.id !== document.scriptRevisionId,
          voiceChanged: !!document && voice?.id !== document.voiceRevisionId,
          affectedShotIds: document && stale.has(revision!.id) ? shots.map((s) => s.shotId) : [],
        },
        assetRequirements: shots
          .filter((s) => s.route === 'pending')
          .map((shot) => ({
            directorRevisionId: revision!.id,
            shotId: shot.shotId,
            status: 'pending' as const,
            intent: shot.visualSearchIntent,
          })),
        diff: parent
          ? {
              added: shots
                .filter((s) => !parent.some((p) => p.shotId === s.shotId))
                .map((s) => s.shotId),
              removed: parent
                .filter((p) => !shots.some((s) => s.shotId === p.shotId))
                .map((s) => s.shotId),
              changed: shots
                .filter((s) =>
                  parent.some((p) => p.shotId === s.shotId && fingerprint(p) !== fingerprint(s)),
                )
                .map((s) => s.shotId),
              changes: [
                ...new Set([...parent.map((s) => s.shotId), ...shots.map((s) => s.shotId)]),
              ].flatMap((shotId) => {
                const before = parent.find((s) => s.shotId === shotId) ?? null,
                  after = shots.find((s) => s.shotId === shotId) ?? null,
                  beforeOrder = parent.findIndex((s) => s.shotId === shotId),
                  afterOrder = shots.findIndex((s) => s.shotId === shotId);
                return fingerprint(before) !== fingerprint(after) || beforeOrder !== afterOrder
                  ? [{ shotId, before, after, beforeOrder, afterOrder }]
                  : [];
              }),
              orderChanged:
                parent.map((s) => s.shotId).join() !== shots.map((s) => s.shotId).join(),
            }
          : null,
        jobs: s.jobs.filter((j) => j.kind === 'storyboard'),
      };
    },
  };
}
export async function director() {
  await workflow();
  return createDirectorService(
    await (globalThis as { studioWorkflow?: Promise<WorkflowRepository> }).studioWorkflow!,
  );
}
export type DirectorWorkspace = Awaited<
  ReturnType<ReturnType<typeof createDirectorService>['read']>
>;

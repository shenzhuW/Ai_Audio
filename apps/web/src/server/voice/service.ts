import { z } from 'zod';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { WorkflowRepository } from '../workflow/repository';
import { workflow } from '../workflow';
import { createWorkflowService } from '../workflow/service';
import { staleRevisions, fingerprint } from '../workflow/engine';
import { voiceTimeline, voiceCues, subtitleTrack } from './engine';
import { scriptSegments } from '../script/engine';
import { voiceProviders } from './providers';
import { voiceBlobStore, validateAudioUpload } from './storage';
import { config } from '../config';
import { AppError } from '../errors';
export function createVoiceService(repo: WorkflowRepository) {
  const wf = createWorkflowService(repo);
  return {
    async read(projectId: string, owner: string, revisionId?: string) {
      z.uuid().parse(projectId);
      if (revisionId) z.uuid().parse(revisionId);
      const { state: s, project } = await repo.transaction(projectId, owner),
        a = s.artifacts.find((a) => a.type === 'voice'),
        script = s.artifacts.find((a) => a.type === 'script'),
        stale = staleRevisions(s);
      const revisions = s.revisions
          .filter((r) => r.artifactId === a?.id)
          .sort((a, b) => b.revisionNumber - a.revisionNumber),
        r = revisions.find((r) => r.id === (revisionId ?? a?.currentRevisionId)) ?? null;
      if (revisionId && !r) throw new AppError('NOT_FOUND', '配音修订不存在。', 404);
      const timeline = r ? (voiceTimeline(s, r.id) ?? null) : null,
        cues = r ? voiceCues(s, r.id) : [],
        track = r ? (subtitleTrack(s, r.id) ?? null) : null;
      const availableScript =
        s.revisions.find(
          (r) => r.id === script?.approvedRevisionId && r.scriptSchemaVersion && !stale.has(r.id),
        ) ?? null;
      const bound = timeline ? scriptSegments(s, timeline.scriptRevisionId) : [],
        current = availableScript ? scriptSegments(s, availableScript.id) : [];
      const affected = cues
        .filter(
          (c) =>
            !current.some(
              (s) =>
                s.id === c.segmentId &&
                createHash('sha256').update(s.text).digest('hex') === c.segmentTextSha256,
            ),
        )
        .map((c) => c.anchorId);
      const parent = r?.parentRevisionId ? voiceTimeline(s, r.parentRevisionId) : null;
      return {
        projectId,
        currentRevisionId: a?.currentRevisionId ?? null,
        revision: r,
        revisions,
        timeline,
        cues,
        track,
        segments: bound.map((segment) => ({
          ...segment,
          textSha256: createHash('sha256').update(segment.text).digest('hex'),
        })),
        availableScript,
        brief: {
          targetDurationMs: project.targetDurationMs,
          voiceMode: project.input.voiceMode,
          language: project.language,
        },
        providers: await voiceProviders(),
        impact: {
          stale: !!r && stale.has(r.id),
          scriptChanged: !!timeline && availableScript?.id !== timeline.scriptRevisionId,
          affectedAnchorIds: affected,
          downstream: s.dependencies
            .filter((d) => revisions.some((r) => r.id === d.upstreamRevisionId))
            .map((d) => ({
              revisionId: d.downstreamRevisionId,
              stale: stale.has(d.downstreamRevisionId),
            })),
        },
        jobs: s.jobs.filter((j) => j.kind === 'voice'),
        diff:
          parent && r
            ? {
                timelineChanged:
                  fingerprint({ ...parent, id: '', revisionId: '' }) !==
                  fingerprint({ ...timeline, id: '', revisionId: '' }),
                cueChanges: [
                  ...new Set([
                    ...voiceCues(s, r.parentRevisionId!).map((c) => c.anchorId),
                    ...cues.map((c) => c.anchorId),
                  ]),
                ].filter(
                  (id) =>
                    fingerprint(
                      voiceCues(s, r.parentRevisionId!).find((c) => c.anchorId === id) ?? null,
                    ) !== fingerprint(cues.find((c) => c.anchorId === id) ?? null),
                ),
                subtitleChanges:
                  fingerprint(subtitleTrack(s, r.parentRevisionId!)?.cues ?? []) !==
                  fingerprint(track?.cues ?? []),
              }
            : null,
      };
    },
    async upload(
      projectId: string,
      owner: string,
      body: { revisionId: string; expectedVersion: number },
      name: string,
      bytes: Buffer,
      key: string,
    ) {
      const { state: s } = await repo.transaction(projectId, owner),
        r = s.revisions.find((r) => r.id === body.revisionId),
        doc = r && voiceTimeline(s, r.id),
        a = s.artifacts.find((a) => a.id === r?.artifactId);
      if (!r || !doc || a?.type !== 'voice')
        throw new AppError('NOT_FOUND', '配音修订不存在。', 404);
      if (s.receipts.some((receipt) => receipt.key === key)) {
        const hash = createHash('sha256')
            .update(JSON.stringify([projectId, body.revisionId, key, name]))
            .update(bytes)
            .digest('hex'),
          id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        const { mime } = validateAudioUpload(name, bytes, config().maxUploadBytes);
        return wf.execute(
          projectId,
          owner,
          {
            action: 'voice-import',
            ...body,
            blob: {
              id,
              name: name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180),
              mime,
              sizeBytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            },
          },
          key,
        );
      }
      if (r.status !== 'draft') throw new AppError('IMMUTABLE_REVISION', '请Fork后导入。', 422);
      if (doc.mode !== 'import')
        throw new AppError('VOICE_MODE_MISMATCH', '请先切换为导入配音。', 422);
      if (!key || key.length > 180)
        throw new AppError('IDEMPOTENCY_KEY_REQUIRED', '需要幂等键。', 400);
      // Retry receipts must remain replayable even if the first request already queued a job.
      if (r.version !== body.expectedVersion || a.currentRevisionId !== r.id)
        throw new AppError('REVISION_CONFLICT', '时间轴版本已变化。', 409);
      const hash = createHash('sha256')
          .update(JSON.stringify([projectId, body.revisionId, key, name]))
          .update(bytes)
          .digest('hex'),
        blobId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const c = config(),
        blob = await voiceBlobStore(join(c.dataDir, 'voice-blobs'), c.maxUploadBytes).put(
          name,
          bytes,
          blobId,
        );
      return wf.execute(projectId, owner, { action: 'voice-import', ...body, blob }, key);
    },
    async file(projectId: string, owner: string, blobId: string) {
      z.uuid().parse(blobId);
      const { state: s } = await repo.transaction(projectId, owner);
      const audio = [
        ...s.voiceTimelines.flatMap((t) => (t.audio ? [t.audio] : [])),
        ...s.jobs.flatMap((j) =>
          j.state === 'succeeded' && j.voiceResult && 'audio' in j.voiceResult
            ? [j.voiceResult.audio]
            : [],
        ),
      ].find((a) => a.blob.id === blobId);
      if (!audio) throw new AppError('NOT_FOUND', '此音频不属于该项目的有效产物。', 404);
      const c = config();
      return {
        blob: audio.blob,
        bytes: await voiceBlobStore(join(c.dataDir, 'voice-blobs'), c.maxUploadBytes).read(
          audio.blob,
        ),
      };
    },
  };
}
export async function voice() {
  await workflow();
  return createVoiceService(
    await (globalThis as { studioWorkflow?: Promise<WorkflowRepository> }).studioWorkflow!,
  );
}
export type VoiceWorkspace = Awaited<ReturnType<ReturnType<typeof createVoiceService>['read']>>;

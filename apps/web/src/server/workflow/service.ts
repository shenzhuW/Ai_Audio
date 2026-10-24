import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { WorkflowCommand } from '../../domain/workflow';
import { AppError } from '../errors';
import { applyWorkflow, workflowSnapshot } from './engine';
import type { WorkflowRepository, Collection } from './repository';
import { MockWorkflowTextProvider } from './provider';
import { scriptProvider } from '../script/providers';
import type { AiRun } from '../../domain/ai';
import { processVoice } from '../voice/providers';
import { config } from '../config';
import type { VoiceRun } from '../../domain/voice';
export function createWorkflowService(repo: WorkflowRepository) {
  return {
    async execute(projectId: string, owner: string, command: WorkflowCommand, key: string) {
      z.uuid().parse(projectId);
      return (
        await repo.transaction(projectId, owner, (state, project) =>
          applyWorkflow(state, project, command, key, owner),
        )
      ).result;
    },
    async read(projectId: string, owner: string) {
      z.uuid().parse(projectId);
      const { state, project } = await repo.transaction(projectId, owner);
      return workflowSnapshot(state, project);
    },
    async locate(collection: Collection, id: string, owner: string) {
      z.uuid().parse(id);
      return repo.locate(collection, id, owner);
    },
    async tick(workerId = randomUUID(), signal?: AbortSignal) {
      let processed = 0;
      for (const projectId of await repo.workProjects()) {
        const { state, project } = await repo.transaction(projectId, 'local-user');
        for (const j of state.jobs) {
          if (j.provider === 'remotion' || j.provider === 'research') continue; // Dedicated workers own media/research jobs.
          try {
            if (j.state === 'running' && Date.parse(j.leaseExpiresAt!) <= Date.now()) {
              await this.execute(
                projectId,
                'local-user',
                { action: 'recover', jobId: j.id },
                `recover:${j.id}:${j.version}`,
              );
              processed++;
              continue;
            }
            if (j.state !== 'queued') continue;
            const claim = await repo.transaction(projectId, 'local-user', (s, p) =>
              applyWorkflow(
                s,
                p,
                { action: 'claim', jobId: j.id, workerId },
                `claim:${j.id}:${j.version}:${workerId}`,
                'local-user',
              ),
            );
            const claimed = claim.state.jobs.find((x) => x.id === j.id)!;
            if (claimed.state !== 'running') continue;
            const inputTexts = claimed.inputRevisionIds.map(
              (id) => claim.state.revisions.find((r) => r.id === id)!.text,
            );
            if (claimed.provider === 'voice') {
              const controller = new AbortController(),
                abort = () => controller.abort();
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) abort();
              let heartbeat: ReturnType<typeof setInterval> | undefined,
                pending = Promise.resolve(),
                run: VoiceRun | undefined,
                recorded = false;
              try {
                const beat = () =>
                  (pending = pending
                    .then(async () => {
                      if (!controller.signal.aborted)
                        await this.execute(
                          projectId,
                          'local-user',
                          {
                            action: 'heartbeat',
                            jobId: j.id,
                            workerId,
                            progress: 0.5,
                            message: '真实配音/音频校验处理中；字幕不是精确转录',
                          },
                          randomUUID(),
                        );
                    })
                    .catch(() => controller.abort()));
                await beat();
                heartbeat = setInterval(beat, 2000);
                const output = await processVoice(claimed.voiceInput!, {
                  dataDir: config().dataDir,
                  signal: controller.signal,
                });
                run = output.run;
                await pending;
                if (controller.signal.aborted) continue;
                await this.execute(
                  projectId,
                  'local-user',
                  { action: 'finish', jobId: j.id, workerId, voiceResult: output },
                  `finish:${j.id}:${claimed.attempt}`,
                );
                recorded = true;
              } catch (e) {
                run = (e as { voiceRun?: VoiceRun }).voiceRun;
                try {
                  await this.execute(
                    projectId,
                    'local-user',
                    {
                      action: 'finish',
                      jobId: j.id,
                      workerId,
                      errorCode: e instanceof AppError ? e.code : 'VOICE_PROCESS_FAILED',
                      ...(run ? { voiceRun: run } : {}),
                    },
                    `finish:${j.id}:${claimed.attempt}`,
                  );
                  recorded = true;
                } catch {
                  /* Cancelled/expired owner cannot write. */
                }
              } finally {
                if (heartbeat) clearInterval(heartbeat);
                await pending;
                signal?.removeEventListener('abort', abort);
                if (!recorded && run)
                  try {
                    await this.execute(
                      projectId,
                      'local-user',
                      {
                        action: 'record-voice-run',
                        jobId: j.id,
                        workerId,
                        attempt: claimed.attempt,
                        run,
                      },
                      randomUUID(),
                    );
                  } catch {
                    /* A newer attempt owns its audit. */
                  }
              }
              processed++;
              continue;
            }
            if (claimed.provider === 'script') {
              let heartbeat: ReturnType<typeof setInterval> | undefined;
              const controller = new AbortController();
              const abort = () => controller.abort();
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) controller.abort();
              let aiRuns: AiRun[] = [],
                auditRecorded = false;
              let pending = Promise.resolve();
              try {
                const input = claimed.scriptInput!;
                const beat = () =>
                  (pending = pending
                    .then(async () => {
                      if (controller.signal.aborted) return;
                      await this.execute(
                        projectId,
                        'local-user',
                        {
                          action: 'heartbeat',
                          jobId: j.id,
                          workerId,
                          progress: 0.5,
                          message: `${input.mode} 文稿任务处理中`,
                        },
                        randomUUID(),
                      );
                    })
                    .catch(() => {
                      controller.abort();
                    }));
                await beat();
                heartbeat = setInterval(beat, 2000);
                const provider = scriptProvider(input.mode);
                const output = await (input.segmentId
                  ? provider.rewrite(input, { signal: controller.signal })
                  : provider.generate(input, { signal: controller.signal }));
                if (output.aiRun) aiRuns = [output.aiRun];
                await pending;
                if (controller.signal.aborted) continue;
                await this.execute(
                  projectId,
                  'local-user',
                  { action: 'finish', jobId: j.id, workerId, scriptResult: output },
                  `finish:${j.id}:${claimed.attempt}`,
                );
                auditRecorded = true;
              } catch (e) {
                const run = (e as { aiRun?: AiRun }).aiRun;
                if (run) aiRuns = [run];
                if (e instanceof AppError && ['JOB_CONFLICT', 'REVISION_CONFLICT'].includes(e.code))
                  continue;
                await this.execute(
                  projectId,
                  'local-user',
                  {
                    action: 'finish',
                    jobId: j.id,
                    workerId,
                    errorCode: e instanceof AppError ? e.code : 'SCRIPT_PROVIDER_FAILED',
                    ...(aiRuns.length ? { aiRuns } : {}),
                  },
                  `finish:${j.id}:${claimed.attempt}`,
                );
                auditRecorded = true;
              } finally {
                if (heartbeat) clearInterval(heartbeat);
                await pending;
                signal?.removeEventListener('abort', abort);
                if (!auditRecorded && aiRuns.length) {
                  try {
                    await this.execute(
                      projectId,
                      'local-user',
                      {
                        action: 'record-ai-run',
                        jobId: j.id,
                        workerId,
                        attempt: claimed.attempt,
                        aiRuns,
                      },
                      randomUUID(),
                    );
                  } catch {
                    /* A newer attempt cannot be overwritten. */
                  }
                }
              }
              processed++;
              continue;
            }
            // Only text fixtures execute in Phase 01. No media, network or untrusted code.
            const errorCode =
              claimed.provider === 'unconfigured' ? 'PROVIDER_NOT_CONFIGURED' : undefined;
            const text = errorCode
              ? undefined
              : (
                  await new MockWorkflowTextProvider().generate({
                    schemaVersion: 1,
                    prompt: inputTexts.join('\n') || project.input.prompt,
                    sourceIds: claimed.inputRevisionIds,
                  })
                ).text;
            await this.execute(
              projectId,
              'local-user',
              {
                action: 'finish',
                jobId: j.id,
                workerId,
                ...(errorCode ? { errorCode } : { text }),
              },
              `finish:${j.id}:${claimed.attempt}`,
            );
            processed++;
          } catch (e) {
            if (
              !(e instanceof AppError) ||
              !['JOB_CONFLICT', 'REVISION_CONFLICT', 'STALE_INPUT'].includes(e.code)
            )
              throw e;
          }
        }
      }
      return processed;
    },
  };
}

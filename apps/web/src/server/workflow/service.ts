import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { WorkflowCommand } from '../../domain/workflow';
import { AppError } from '../errors';
import { applyWorkflow, workflowSnapshot } from './engine';
import type { WorkflowRepository, Collection } from './repository';
import { MockWorkflowTextProvider } from './provider';
import { scriptProvider } from '../script/providers';
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
    async tick(workerId = randomUUID()) {
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
            if (claimed.provider === 'script') {
              let heartbeat: ReturnType<typeof setInterval> | undefined;
              const controller = new AbortController();
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
                  ? provider.rewrite(input)
                  : provider.generate(input));
                await pending;
                if (controller.signal.aborted) continue;
                await this.execute(
                  projectId,
                  'local-user',
                  { action: 'finish', jobId: j.id, workerId, scriptResult: output },
                  `finish:${j.id}:${claimed.attempt}`,
                );
              } catch (e) {
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
                  },
                  `finish:${j.id}:${claimed.attempt}`,
                );
              } finally {
                if (heartbeat) clearInterval(heartbeat);
                await pending;
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

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { api, limitedBody } from '../http';
import { AppError } from '../errors';
import { workflow } from './index';
import type { WorkflowCommand, WorkflowJob } from '../../domain/workflow';
const actor = 'local-user';
export function workflowHttp(request: NextRequest, path: string[]) {
  const asyncRun =
    request.method === 'POST' && ['research-runs', 'script-runs'].includes(path.at(-1) || '');
  return api(
    request,
    async () => {
      const service = await workflow();
      const key = request.headers.get('idempotency-key') || '';
      const write = async (projectId: string, command: WorkflowCommand) =>
        service.execute(projectId, actor, command, key);
      const body = async () => JSON.parse((await limitedBody(request, 200000)).toString());
      if (path[0] === 'projects') {
        const projectId = z.uuid().parse(path[1]);
        const snapshot = await service.read(projectId, actor);
        if (request.method === 'GET' && path[2] === 'workflow') return snapshot;
        if (path[2] === 'artifacts') {
          if (request.method === 'GET') return snapshot.artifacts;
          if (request.method === 'POST')
            return write(projectId, { ...(await body()), action: 'create' });
        }
        if (asyncRun) {
          const j = (await write(projectId, {
            ...(await body()),
            action: 'enqueue',
            kind: path[2] === 'research-runs' ? 'research' : 'script',
          })) as WorkflowJob;
          return { jobId: j.id, status: j.state };
        }
      } else if (path[0] === 'artifacts') {
        const artifactId = z.uuid().parse(path[1]);
        const projectId = await service.locate('artifacts', artifactId, actor);
        const snapshot = await service.read(projectId, actor);
        if (path[2] !== 'revisions') throw new AppError('NOT_FOUND', '接口不存在。', 404);
        if (path.length === 3) {
          if (request.method === 'GET')
            return snapshot.revisions.filter((r) => r.artifactId === artifactId);
          if (request.method === 'POST') {
            const input = await body();
            if (
              !snapshot.revisions.some(
                (r) => r.id === input.revisionId && r.artifactId === artifactId,
              )
            )
              throw new AppError('NOT_FOUND', '该修订不属于此产物。', 404);
            return write(projectId, { ...input, action: 'fork' });
          }
        }
        const revisionId = z.uuid().parse(path[3]);
        const revision = snapshot.revisions.find(
          (r) => r.id === revisionId && r.artifactId === artifactId,
        );
        if (!revision) throw new AppError('NOT_FOUND', '找不到该产物的修订。', 404);
        if (request.method === 'GET') {
          if (path.length === 4) return revision;
          if (path[4] === 'impact') {
            const affected = new Set<string>();
            let more = true;
            while (more) {
              more = false;
              for (const d of snapshot.dependencies)
                if (
                  (d.upstreamRevisionId === revisionId || affected.has(d.upstreamRevisionId)) &&
                  !affected.has(d.downstreamRevisionId)
                ) {
                  affected.add(d.downstreamRevisionId);
                  more = true;
                }
            }
            return { revisionId, downstreamRevisionIds: [...affected] };
          }
        }
        if (request.method === 'PATCH' && path.length === 4)
          return write(projectId, { ...(await body()), action: 'patch', revisionId });
        if (request.method === 'POST' && ['submit', 'approve', 'reject'].includes(path[4]))
          return write(projectId, {
            ...(await body()),
            action: path[4] as 'submit' | 'approve' | 'reject',
            revisionId,
          });
      } else if (path[0] === 'jobs') {
        const jobId = z.uuid().parse(path[1]);
        const projectId = await service.locate('jobs', jobId, actor),
          snapshot = await service.read(projectId, actor);
        const job = snapshot.jobs.find((j) => j.id === jobId)!;
        if (request.method === 'GET') {
          if (path.length === 2) return job;
          if (path[2] === 'events')
            return {
              attempts: job.attempts,
              events: snapshot.audit.filter((e) => e.entityId === jobId),
            };
        }
        if (request.method === 'POST' && ['cancel', 'retry'].includes(path[2]))
          return write(projectId, {
            ...(await body()),
            action: path[2] as 'cancel' | 'retry',
            jobId,
          });
      }
      throw new AppError('NOT_FOUND', '接口不存在。', 404);
    },
    asyncRun ? 202 : request.method === 'POST' && path.at(-1) === 'artifacts' ? 201 : 200,
  );
}

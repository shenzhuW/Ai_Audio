import { NextRequest } from 'next/server';
import { api, limitedBody } from '../http';
import { director } from './service';
import { workflow } from '../workflow';
import { DirectorCommandSchema } from '../../domain/director';
export function directorHttp(r: NextRequest, projectId: string, runs = false) {
  return api(
    r,
    async () => {
      if (r.method === 'GET')
        return (await director()).read(
          projectId,
          'local-user',
          r.nextUrl.searchParams.get('revisionId') || undefined,
        );
      const body = JSON.parse((await limitedBody(r, 2 * 1024 * 1024)).toString()),
        action = runs
          ? 'director-generate'
          : r.method === 'POST'
            ? 'director-start'
            : 'director-save';
      const command = DirectorCommandSchema.parse({ ...body, action }),
        result = (await (
          await workflow()
        ).execute(projectId, 'local-user', command, r.headers.get('idempotency-key') || '')) as {
          id: string;
          state?: string;
        };
      return runs ? { jobId: result.id, status: result.state } : result;
    },
    runs ? 202 : r.method === 'POST' ? 201 : 200,
  );
}

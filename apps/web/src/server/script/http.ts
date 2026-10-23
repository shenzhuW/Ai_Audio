import { NextRequest } from 'next/server';
import { z } from 'zod';
import { api, limitedBody } from '../http';
import { script } from './service';
import { workflow } from '../workflow';
import { ScriptCommandSchema } from '../../domain/script';
export function scriptHttp(
  r: NextRequest,
  projectId: string,
  section: 'document' | 'start' | 'save' | 'generate',
) {
  return api(
    r,
    async () => {
      z.uuid().parse(projectId);
      if (section === 'document')
        return (await script()).read(
          projectId,
          'local-user',
          r.nextUrl.searchParams.get('revisionId') || undefined,
          r.nextUrl.searchParams.get('compareId') || undefined,
        );
      const body = JSON.parse((await limitedBody(r, 300000)).toString());
      const command = ScriptCommandSchema.parse({
        ...body,
        action:
          section === 'start'
            ? 'script-start'
            : section === 'save'
              ? 'script-save'
              : 'script-generate',
      });
      const result = (await (
        await workflow()
      ).execute(projectId, 'local-user', command, r.headers.get('idempotency-key') || '')) as {
        id: string;
        state?: string;
      };
      return section === 'generate' ? { jobId: result.id, status: result.state } : result;
    },
    section === 'start' ? 201 : section === 'generate' ? 202 : 200,
  );
}

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { api, limitedBody } from '@/server/http';
import { workflow } from '@/server/workflow';
import { RenderRequestSchema } from '@/domain/motion';
import type { WorkflowJob } from '@/domain/workflow';
import { trustedInput } from '@/server/render/preset';
export async function POST(r: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return api(
    r,
    async () => {
      const id = z.uuid().parse((await ctx.params).projectId);
      const body = RenderRequestSchema.parse(JSON.parse((await limitedBody(r, 10000)).toString()));
      const service = await workflow();
      await service.read(id, 'local-user');
      const job = (await service.execute(
        id,
        'local-user',
        { action: 'render', input: trustedInput(body.titleFontSize) },
        r.headers.get('idempotency-key') || '',
      )) as WorkflowJob;
      return { jobId: job.id, status: job.state };
    },
    202,
  );
}

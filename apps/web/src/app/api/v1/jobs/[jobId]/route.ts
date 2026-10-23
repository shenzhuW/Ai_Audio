import { NextRequest } from 'next/server';
import { workflowHttp } from '@/server/workflow/http';
type Context = { params: Promise<{ jobId: string }> };
async function handle(request: NextRequest, ctx: Context) {
  const p = await ctx.params;
  return workflowHttp(request, ['jobs', p.jobId]);
}
export { handle as GET };

import { NextRequest } from 'next/server';
import { workflowHttp } from '@/server/workflow/http';
type Context = { params: Promise<{ jobId: string; action: string }> };
async function handle(request: NextRequest, ctx: Context) {
  const p = await ctx.params;
  return workflowHttp(request, ['jobs', p.jobId, p.action]);
}
export { handle as GET, handle as POST };

import { NextRequest } from 'next/server';
import { workflowHttp } from '@/server/workflow/http';
type Context = { params: Promise<{ projectId: string }> };
async function handle(request: NextRequest, ctx: Context) {
  const p = await ctx.params;
  return workflowHttp(request, ['projects', p.projectId, 'workflow']);
}
export { handle as GET };

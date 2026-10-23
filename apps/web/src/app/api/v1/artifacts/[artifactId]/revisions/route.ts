import { NextRequest } from 'next/server';
import { workflowHttp } from '@/server/workflow/http';
type Context = { params: Promise<{ artifactId: string }> };
async function handle(request: NextRequest, ctx: Context) {
  const p = await ctx.params;
  return workflowHttp(request, ['artifacts', p.artifactId, 'revisions']);
}
export { handle as GET, handle as POST };

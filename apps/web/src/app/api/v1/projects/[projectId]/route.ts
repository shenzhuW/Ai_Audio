import { NextRequest } from 'next/server';
import { z } from 'zod';
import { api, limitedBody } from '@/server/http';
import { projects } from '@/server/project';
type Context = { params: Promise<{ projectId: string }> };
export function GET(r: NextRequest, ctx: Context) {
  return api(r, async () =>
    (await projects()).get(z.uuid().parse((await ctx.params).projectId), 'local-user'),
  );
}
export function PATCH(r: NextRequest, ctx: Context) {
  return api(r, async () =>
    (await projects()).update(
      z.uuid().parse((await ctx.params).projectId),
      JSON.parse((await limitedBody(r, 20000)).toString()),
      'local-user',
    ),
  );
}

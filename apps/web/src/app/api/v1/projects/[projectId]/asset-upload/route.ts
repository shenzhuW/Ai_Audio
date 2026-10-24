import { NextRequest } from 'next/server';
import { assetHttp } from '@/server/assets/http';
async function handle(r: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  return assetHttp(r, (await c.params).projectId, true);
}
export const POST = handle;

import { NextRequest } from 'next/server';
import { assetHttp } from '@/server/assets/http';
async function handle(r: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  return assetHttp(r, (await c.params).projectId, false);
}
export const GET = handle;
export const POST = handle;

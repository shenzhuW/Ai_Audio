import { NextRequest } from 'next/server';
import { assetFile } from '@/server/assets/http';
async function handle(r: NextRequest, c: { params: Promise<{ projectId: string; key: string }> }) {
  const p = await c.params;
  return assetFile(r, p.projectId, p.key);
}
export const GET = handle;
export const HEAD = handle;

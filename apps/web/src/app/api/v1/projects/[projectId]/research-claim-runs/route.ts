import { NextRequest } from 'next/server';
import { researchHttp } from '@/server/research/http';
export async function POST(r: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const p = await c.params;
  return researchHttp(r, p.projectId, 'claim-runs');
}

import { NextRequest } from 'next/server';
import { researchHttp } from '@/server/research/http';
export async function POST(
  r: NextRequest,
  c: { params: Promise<{ projectId: string; candidateId: string }> },
) {
  const p = await c.params;
  return researchHttp(r, p.projectId, 'candidate-review', p.candidateId);
}

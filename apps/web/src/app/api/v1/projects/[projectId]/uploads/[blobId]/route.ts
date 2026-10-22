import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { join } from 'node:path';
import { api } from '@/server/http';
import { projects } from '@/server/project';
import { localBlobStore } from '@/server/storage';
import { config } from '@/server/config';
import { AppError } from '@/server/errors';
export async function GET(
  r: NextRequest,
  ctx: { params: Promise<{ projectId: string; blobId: string }> },
) {
  let download: { bytes: Buffer; name: string } | undefined;
  const response = await api(r, async () => {
    const { projectId, blobId } = await ctx.params;
    z.uuid().parse(projectId);
    z.uuid().parse(blobId);
    const p = await (await projects()).get(projectId, 'local-user');
    const file = p.input.attachments.find((a) => a.id === blobId);
    if (!file) throw new AppError('NOT_FOUND', '资料不存在', 404);
    const c = config();
    download = {
      bytes: await localBlobStore(join(c.dataDir, 'blobs'), c.maxUploadBytes).read(blobId),
      name: file.name,
    };
    return null;
  });
  if (!download || !response.ok) return response;
  return new NextResponse(new Uint8Array(download.bytes), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.name)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

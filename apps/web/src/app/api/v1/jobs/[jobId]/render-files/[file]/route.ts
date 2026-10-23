import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { api } from '@/server/http';
import { workflow } from '@/server/workflow';
import { config } from '@/server/config';
import { AppError } from '@/server/errors';
import { renderFiles } from '@/domain/motion';
import { byteRange } from '@/server/render/files';
export async function GET(
  r: NextRequest,
  ctx: { params: Promise<{ jobId: string; file: string }> },
) {
  let download: { bytes: Buffer; file: string } | undefined;
  const response = await api(r, async () => {
    const params = await ctx.params;
    const id = z.uuid().parse(params.jobId),
      file = z.enum(renderFiles).parse(params.file);
    const service = await workflow();
    const project = await service.locate('jobs', id, 'local-user');
    const job = (await service.read(project, 'local-user')).jobs.find((j) => j.id === id)!;
    const artifact = job.renderResult?.artifacts.find((a) => a.file === file);
    if (job.state !== 'succeeded' || !artifact)
      throw new AppError('NOT_READY', '此任务尚无通过验证的渲染产物', 409);
    const bytes = await readFile(
      join(config().dataDir, 'renders', id, 'attempt-' + job.attempt, file),
    );
    if (
      bytes.length !== artifact.sizeBytes ||
      createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
    )
      throw new AppError('ARTIFACT_CORRUPT', '产物校验失败，请保留日志并重新渲染', 409);
    download = { bytes, file };
    return null;
  });
  if (!download || !response.ok) return response;
  const file = download as { bytes: Buffer; file: string };
  let range;
  try {
    range = byteRange(r.headers.get('range'), file.bytes.length);
  } catch {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${file.bytes.length}`, 'Cache-Control': 'no-store' },
    });
  }
  const headers: Record<string, string> = {
    'Content-Type': file.file.endsWith('.mp4')
      ? 'video/mp4'
      : file.file.endsWith('.png')
        ? 'image/png'
        : 'application/json',
    'Content-Length': String(range.end - range.start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${file.file.endsWith('.json') ? 'attachment' : 'inline'}; filename="${file.file}"`,
  };
  if (range.status === 206)
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.bytes.length}`;
  return new NextResponse(new Uint8Array(file.bytes.subarray(range.start, range.end + 1)), {
    status: range.status,
    headers,
  });
}
export const HEAD = GET;

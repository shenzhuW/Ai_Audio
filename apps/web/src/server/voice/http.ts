import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { api, limitedBody } from '../http';
import { voice } from './service';
import { workflow } from '../workflow';
import { VoiceCommandSchema, type AudioBlob } from '../../domain/voice';
import { AppError } from '../errors';
import { config } from '../config';
import { byteRange } from '../render/files';
export function voiceHttp(
  r: NextRequest,
  projectId: string,
  section: 'timeline' | 'mode' | 'retime' | 'runs' | 'upload' | 'analysis',
) {
  return api(
    r,
    async () => {
      z.uuid().parse(projectId);
      const service = await voice();
      if (r.method === 'GET')
        return service.read(
          projectId,
          'local-user',
          r.nextUrl.searchParams.get('revisionId') || undefined,
        );
      const key = r.headers.get('idempotency-key') || '';
      if (section === 'upload') {
        const bytes = await limitedBody(r, config().maxUploadBytes + 30000),
          form = await new Response(new Uint8Array(bytes), {
            headers: { 'Content-Type': r.headers.get('content-type') || '' },
          }).formData();
        if (
          [...form.keys()].some((k) => !['metadata', 'file'].includes(k)) ||
          form.getAll('file').length !== 1 ||
          form.getAll('metadata').length !== 1
        )
          throw new AppError('INVALID_AUDIO', '请提供单个音频和metadata。', 400);
        const file = form.get('file');
        if (!(file instanceof File)) throw new AppError('INVALID_AUDIO', '缺少音频。', 400);
        const metadata = z
          .object({ revisionId: z.uuid(), expectedVersion: z.number().int().positive() })
          .strict()
          .parse(JSON.parse(String(form.get('metadata'))));
        const result = (await service.upload(
          projectId,
          'local-user',
          metadata,
          file.name,
          Buffer.from(await file.arrayBuffer()),
          key,
        )) as { id: string; state: string };
        return { jobId: result.id, status: result.state };
      }
      const body = JSON.parse((await limitedBody(r, 2 * 1024 * 1024)).toString()),
        action =
          section === 'timeline'
            ? r.method === 'POST'
              ? 'voice-start'
              : 'voice-save'
            : section === 'mode'
              ? 'voice-mode'
              : section === 'retime'
                ? 'voice-retime'
                : section === 'analysis'
                  ? 'voice-analyze'
                  : 'voice-generate';
      const command = VoiceCommandSchema.parse({ ...body, action }),
        result = (await (await workflow()).execute(projectId, 'local-user', command, key)) as {
          id: string;
          state?: string;
        };
      return section === 'runs' || section === 'analysis'
        ? { jobId: result.id, status: result.state }
        : result;
    },
    section === 'runs' || section === 'upload' || section === 'analysis'
      ? 202
      : section === 'timeline' && r.method === 'POST'
        ? 201
        : 200,
  );
}
export async function voiceFile(r: NextRequest, projectId: string, blobId: string) {
  let download: { bytes: Buffer; blob: AudioBlob } | undefined;
  const response = await api(r, async () => {
    z.uuid().parse(projectId);
    download = await (await voice()).file(projectId, 'local-user', blobId);
    return null;
  });
  if (!download || !response.ok) return response;
  const { bytes, blob } = download;
  let range;
  try {
    range = byteRange(r.headers.get('range'), bytes.length);
  } catch {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${bytes.length}`, 'Cache-Control': 'no-store' },
    });
  }
  const headers: Record<string, string> = {
    'Content-Type': blob.mime,
    'Content-Length': String(range.end - range.start + 1),
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(blob.name)}`,
  };
  if (range.status === 206)
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${bytes.length}`;
  return new NextResponse(
    r.method === 'HEAD' ? null : new Uint8Array(bytes.subarray(range.start, range.end + 1)),
    { status: range.status, headers },
  );
}

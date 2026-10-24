import { NextRequest, NextResponse } from 'next/server';
import { api, limitedBody } from '../http';
import { assets } from './service';
import { assetStore } from './storage';
import { config } from '../config';
import { byteRange } from '../render/files';
import { AppError } from '../errors';
export function assetHttp(r: NextRequest, projectId: string, upload = false) {
  return api(
    r,
    async () => {
      const service = await assets();
      if (r.method === 'GET')
        return service.read(
          projectId,
          'local-user',
          r.nextUrl.searchParams.get('directorRevisionId') || undefined,
        );
      const key = r.headers.get('idempotency-key') || '';
      if (upload) {
        // Authorize project before accepting bytes or allocating a blob.
        await service.read(projectId, 'local-user');
        if (!key || key.length > 180)
          throw new AppError('IDEMPOTENCY_KEY_REQUIRED', '缺少幂等键。', 400);
        const limit =
          Math.min(100, Math.max(1, Number(process.env.STUDIO_ASSET_MAX_MB || 64))) * 1048576;
        const bytes = await limitedBody(r, limit + 30000),
          form = await new Response(new Uint8Array(bytes), {
            headers: { 'Content-Type': r.headers.get('content-type') || '' },
          }).formData();
        if (
          [...form.keys()].some(
            (k) => !['file', 'title', 'author', 'restrictions', 'license'].includes(k),
          ) ||
          form.getAll('file').length !== 1
        )
          throw new AppError('ASSET_CONTENT_INVALID', '请上传单个素材。', 400);
        const file = form.get('file');
        if (!(file instanceof File)) throw new AppError('ASSET_CONTENT_INVALID', '缺少文件。', 400);
        const blob = await assetStore(config().dataDir).put(
          Buffer.from(await file.arrayBuffer()),
          limit,
          file.name,
        );
        return service.execute(
          projectId,
          'local-user',
          {
            action: 'asset-import',
            blob,
            title: String(form.get('title') || file.name),
            author: String(form.get('author') || ''),
            restrictions: String(form.get('restrictions') || '使用限制未知；仅内部测试'),
            license: String(form.get('license') || 'unknown'),
          },
          key,
        );
      }
      const body = JSON.parse((await limitedBody(r, 1048576)).toString());
      // Raw blob references are accepted only through the authenticated upload path.
      if (body.action === 'asset-import')
        throw new AppError('ASSET_CONTENT_INVALID', '文件必须通过上传接口验证。', 400);
      return service.execute(projectId, 'local-user', body, key);
    },
    upload ? 202 : 200,
  );
}
export async function assetFile(r: NextRequest, projectId: string, key: string) {
  let file: Awaited<ReturnType<Awaited<ReturnType<typeof assets>>['file']>> | undefined;
  const response = await api(r, async () => {
    file = await (await assets()).file(projectId, 'local-user', key);
    return null;
  });
  if (!file || !response.ok) return response;
  const { bytes, blob } = file;
  let range;
  try {
    range = byteRange(r.headers.get('range'), bytes.length);
  } catch {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${bytes.length}` },
    });
  }
  const headers: Record<string, string> = {
    'Content-Type': blob.mime,
    'Content-Length': String(range.end - range.start + 1),
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (range.status === 206)
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${bytes.length}`;
  return new NextResponse(
    r.method === 'HEAD' ? null : new Uint8Array(bytes.subarray(range.start, range.end + 1)),
    { status: range.status, headers },
  );
}

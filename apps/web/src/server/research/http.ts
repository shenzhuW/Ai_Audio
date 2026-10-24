import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { join } from 'node:path';
import { api, limitedBody } from '../http';
import { AppError } from '../errors';
import { config } from '../config';
import { research } from './service';
import { workflow } from '../workflow';
import { researchBlobStore } from './storage';
import { localBlobStore } from '../storage';
import { ResearchCommandSchema, type ResearchBlob } from '../../domain/research';
import { byteRange } from '../render/files';
const uploadSchema = z
  .object({
    revisionId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(250),
    sourceUrl: z.url().optional(),
    publisher: z.string().max(2000).optional(),
    creator: z.string().max(2000).optional(),
    publishedAt: z.iso.date().nullable().optional(),
    knownRestrictions: z.string().max(2000).optional(),
    licenseStatus: z.enum(['unknown', 'research_only', 'pending', 'blocked']).optional(),
  })
  .strict();
export function researchHttp(r: NextRequest, projectId: string, section: string, itemId?: string) {
  const run = ['analysis-runs', 'search-runs', 'claim-runs'].includes(section);
  return api(
    r,
    async () => {
      z.uuid().parse(projectId);
      const service = await research();
      const body = async () => JSON.parse((await limitedBody(r, 100000)).toString());
      if (r.method === 'GET') {
        const data = await service.read(
          projectId,
          'local-user',
          r.nextUrl.searchParams.get('revisionId') || undefined,
        );
        if (section === 'research') return data;
        if (section === 'research-sources')
          return data.sources.map((s) => ({
            ...s,
            indexes: data.indexes.filter((x) => x.sourceId === s.id),
          }));
        if (section === 'claims')
          return data.claims.map((c) => ({
            ...c,
            evidence: data.evidence.filter((e) => e.claimId === c.id),
          }));
      }
      if (r.method === 'POST' && section === 'research-sources') {
        const c = config(),
          bytes = await limitedBody(r, c.maxUploadBytes + 30000);
        const form = await new Response(new Uint8Array(bytes), {
          headers: { 'Content-Type': r.headers.get('content-type') || '' },
        }).formData();
        if (
          [...form.keys()].some((x) => !['metadata', 'file'].includes(x)) ||
          form.getAll('file').length !== 1 ||
          form.getAll('metadata').length !== 1
        )
          throw new AppError('VALIDATION_ERROR', '请提供单个文件与 metadata。', 400);
        const file = form.get('file');
        if (!(file instanceof File)) throw new AppError('INVALID_FILE', '缺少上传文件。', 400);
        const metadata = uploadSchema.parse(JSON.parse(String(form.get('metadata'))));
        return service.upload(
          projectId,
          'local-user',
          metadata,
          file.name,
          Buffer.from(await file.arrayBuffer()),
          r.headers.get('idempotency-key') || '',
        );
      }
      if (r.method === 'POST' && section === 'import-source') {
        const input = z
          .object({
            revisionId: z.uuid(),
            expectedVersion: z.number().int().positive(),
            attachmentId: z.uuid(),
          })
          .strict()
          .parse(await body());
        const data = await service.read(projectId, 'local-user'),
          old = data.initialAttachments.find((a) => a.id === input.attachmentId);
        if (!old) throw new AppError('NOT_FOUND', '原件不属于此项目。', 404);
        const c = config(),
          bytes = await localBlobStore(join(c.dataDir, 'blobs'), c.maxUploadBytes).read(old.id);
        return service.upload(
          projectId,
          'local-user',
          {
            revisionId: input.revisionId,
            expectedVersion: input.expectedVersion,
            title: old.name,
            knownRestrictions: '用户初始上传；其他使用限制未知',
          },
          old.name,
          bytes,
          r.headers.get('idempotency-key') || '',
        );
      }
      const input = await body();
      let action: string;
      if (section === 'claims') action = 'research-claim';
      else if (section === 'evidence') action = 'research-evidence';
      else if (section === 'source-settings') action = 'research-source-edit';
      else if (section === 'analysis-runs') action = 'research-analyze';
      else if (section === 'search-runs') action = 'research-search';
      else if (section === 'claim-runs') action = 'research-claims';
      else if (section === 'candidate-review') action = 'research-candidate-review';
      else throw new AppError('NOT_FOUND', '研究接口不存在。', 404);
      const command = ResearchCommandSchema.parse({
        ...input,
        ...(itemId
          ? section === 'candidate-review'
            ? { candidateId: itemId }
            : section === 'claims'
              ? { claimId: itemId }
              : section === 'evidence'
                ? { evidenceId: itemId }
                : { sourceId: itemId }
          : {}),
        action,
      });
      const result = (await (
        await workflow()
      ).execute(projectId, 'local-user', command, r.headers.get('idempotency-key') || '')) as {
        id: string;
        state?: string;
      };
      return run ? { jobId: result.id, status: result.state } : result;
    },
    run
      ? 202
      : r.method === 'POST' &&
          ['research-sources', 'claims', 'evidence', 'import-source'].includes(section)
        ? 201
        : 200,
  );
}
export function sourceHttp(r: NextRequest, sourceId: string) {
  return api(r, async () => {
    const data = await (await research()).source(sourceId, 'local-user');
    return data;
  });
}
export async function researchFile(r: NextRequest, sourceId: string, blobId: string) {
  let download: { bytes: Buffer; blob: ResearchBlob } | undefined;
  const response = await api(r, async () => {
    z.uuid().parse(blobId);
    const { source, indexes } = await (await research()).source(sourceId, 'local-user');
    const blob = [
      source.blob,
      ...(source.webCapture ? [source.webCapture.rawBlob] : []),
      ...indexes.flatMap((x) => x.frameRefs?.map((f) => f.blob) || []),
    ].find((x) => x.id === blobId);
    if (!blob) throw new AppError('NOT_FOUND', '此文件不属于当前来源。', 404);
    const c = config(),
      bytes = await researchBlobStore(join(c.dataDir, 'research-blobs'), c.maxUploadBytes).read(
        blob,
      );
    download = { bytes, blob };
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
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${blob.mime === 'application/pdf' || blob.mime.startsWith('text/') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(blob.name)}`,
  };
  if (range.status === 206)
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${bytes.length}`;
  return new NextResponse(new Uint8Array(bytes.subarray(range.start, range.end + 1)), {
    status: range.status,
    headers,
  });
}

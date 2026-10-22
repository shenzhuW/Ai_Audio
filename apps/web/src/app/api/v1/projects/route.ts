import { NextRequest } from 'next/server';
import { join } from 'node:path';
import { api, limitedBody } from '@/server/http';
import { projects } from '@/server/project';
import { config } from '@/server/config';
import { localBlobStore } from '@/server/storage';
import { AppError } from '@/server/errors';
import { CreateProjectSchema, type Attachment } from '@/domain/project';
export const runtime = 'nodejs';
export function GET(request: NextRequest) {
  return api(request, async () => (await projects()).list('local-user'));
}
export function POST(request: NextRequest) {
  return api(
    request,
    async () => {
      const c = config();
      const attachments: Attachment[] = [];
      const store = localBlobStore(join(c.dataDir, 'blobs'), c.maxUploadBytes);
      try {
        let input: unknown;
        if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
          const buffer = await limitedBody(request, c.maxUploadBytes + 200000);
          const form = await new Response(new Uint8Array(buffer), {
            headers: { 'Content-Type': request.headers.get('content-type')! },
          }).formData();
          input = JSON.parse(String(form.get('brief')));
          CreateProjectSchema.parse(input);
          const files = form.getAll('files');
          if (files.length > 5)
            throw new AppError('UPLOAD_LIMIT', '每个项目最多上传 5 个初始资料文件', 413);
          let totalBytes = 0;
          for (const file of files) {
            if (!(file instanceof File)) throw new AppError('INVALID_FILE', '文件格式错误');
            totalBytes += file.size;
          }
          if (totalBytes > c.maxUploadBytes)
            throw new AppError('UPLOAD_LIMIT', '资料文件总量超过当前上传大小限制', 413);
          for (const file of files) {
            if (!(file instanceof File)) throw new AppError('INVALID_FILE', '文件格式错误');
            attachments.push(await store.put(file.name, Buffer.from(await file.arrayBuffer())));
          }
        } else if (request.headers.get('content-type')?.startsWith('application/json'))
          input = JSON.parse((await limitedBody(request, 200000)).toString());
        else throw new AppError('UNSUPPORTED_MEDIA_TYPE', '请发送 JSON 或表单数据', 415);
        return await (await projects()).create(input, 'local-user', attachments);
      } catch (e) {
        await Promise.all(attachments.map((a) => store.remove(a.id)));
        throw e;
      }
    },
    201,
  );
}

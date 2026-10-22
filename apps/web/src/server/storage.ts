import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from './errors';
import type { Attachment } from '../domain/project';
export interface BlobStore {
  put(name: string, bytes: Buffer): Promise<Attachment>;
  read(id: string): Promise<Buffer>;
  remove(id: string): Promise<void>;
}
export function validateUpload(name: string, bytes: Buffer, limit: number): { mime: string } {
  if (!bytes.length || bytes.length > limit)
    throw new AppError(
      'UPLOAD_LIMIT',
      `文件不能为空，单次上传最多 ${Math.round(limit / 1024 / 1024)} MB`,
      413,
    );
  const ext = extname(name).toLowerCase();
  const invalid = () => {
    throw new AppError(
      'INVALID_FILE',
      '支持 UTF-8 TXT / MD、PDF、PNG、JPEG，文件内容必须与扩展名一致',
      400,
    );
  };
  if (ext === '.txt' || ext === '.md') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      invalid();
    }
    if (bytes.includes(0)) invalid();
    return { mime: ext === '.md' ? 'text/markdown' : 'text/plain' };
  }
  if (ext === '.pdf' && bytes.subarray(0, 5).toString() === '%PDF-')
    return { mime: 'application/pdf' };
  if (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: 'image/png' };
  if (['.jpg', '.jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { mime: 'image/jpeg' };
  return invalid();
}
export function localBlobStore(root: string, limit: number): BlobStore {
  const path = (id: string) => join(root, z.uuid().parse(id));
  return {
    async put(name, bytes) {
      const { mime } = validateUpload(name, bytes, limit);
      const id = randomUUID();
      await mkdir(root, { recursive: true });
      await writeFile(path(id), bytes, { flag: 'wx' });
      return {
        id,
        name: name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180),
        mime,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    },
    async read(id) {
      return readFile(path(id));
    },
    async remove(id) {
      try {
        await unlink(path(id));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    },
  };
}

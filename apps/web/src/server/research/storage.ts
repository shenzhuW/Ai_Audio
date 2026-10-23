import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { validateUpload } from '../storage';
import { AppError } from '../errors';
import type { ResearchBlob } from '../../domain/research';
export function validateResearchUpload(
  name: string,
  bytes: Buffer,
  limit: number,
): { mime: ResearchBlob['mime'] } {
  if (!bytes.length || bytes.length > limit)
    throw new AppError('UPLOAD_LIMIT', `单文件需在 1 字节到 ${limit} 字节之间。`, 413);
  if (extname(name).toLowerCase() !== '.mp4')
    return validateUpload(name, bytes, limit) as { mime: ResearchBlob['mime'] };
  const brand = bytes.subarray(8, 32).toString('ascii');
  if (
    bytes.length < 16 ||
    bytes.subarray(4, 8).toString() !== 'ftyp' ||
    !/isom|iso[2-9]|mp4[12]|avc1|M4V /.test(brand)
  )
    throw new AppError('INVALID_FILE', 'MP4 扩展名与内容签名不符。', 400);
  return { mime: 'video/mp4' };
}
export function researchBlobStore(root: string, limit: number) {
  const file = (id: string) => join(root, z.uuid().parse(id));
  return {
    async put(name: string, bytes: Buffer, id: string = randomUUID()): Promise<ResearchBlob> {
      const { mime } = validateResearchUpload(name, bytes, limit),
        sha256 = createHash('sha256').update(bytes).digest('hex');
      await mkdir(root, { recursive: true });
      try {
        await writeFile(file(id), bytes, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if (!(await readFile(file(id))).equals(bytes))
          throw new AppError('BLOB_CONFLICT', '现有原件与重试内容不符，已保留原件。', 409);
      }
      return {
        id,
        name: name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180),
        mime,
        sizeBytes: bytes.length,
        sha256,
      };
    },
    async read(blob: ResearchBlob) {
      const bytes = await readFile(file(blob.id));
      if (
        bytes.length !== blob.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== blob.sha256
      )
        throw new AppError('BLOB_CORRUPT', '原件散列校验失败。', 409);
      return bytes;
    },
  };
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { AssetBlobSchema, type AssetBlob } from '../../domain/assets';
import { AppError } from '../errors';
export function mediaMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png' as const;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg' as const;
  if (
    bytes.length > 16 &&
    bytes.subarray(4, 8).toString() === 'ftyp' &&
    /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(bytes.subarray(8, 12).toString())
  )
    return 'video/mp4' as const;
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return 'video/webm' as const;
  throw new AppError('ASSET_CONTENT_INVALID', '仅支持内容有效的 PNG、JPEG、MP4 或 WebM。', 400);
}
export function assetStore(dataDir: string) {
  const dir = join(dataDir, 'asset-blobs');
  return {
    async put(bytes: Buffer, limit = 67108864, name?: string): Promise<AssetBlob> {
      if (!bytes.length || bytes.length > limit)
        throw new AppError('ASSET_SIZE_LIMIT', '素材超过大小限制或为空。', 413);
      const mime = mediaMime(bytes),
        ext = name ? extname(name).toLowerCase() : '';
      if (
        name &&
        !{
          'image/png': ['.png'],
          'image/jpeg': ['.jpg', '.jpeg'],
          'video/mp4': ['.mp4', '.m4v'],
          'video/webm': ['.webm'],
        }[mime].includes(ext)
      )
        throw new AppError('ASSET_CONTENT_INVALID', '扩展名与真实内容不一致。', 400);
      const key = createHash('sha256').update(bytes).digest('hex');
      await mkdir(dir, { recursive: true });
      try {
        await writeFile(join(dir, key), bytes, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const existing = await readFile(join(dir, key));
        if (!existing.equals(bytes)) throw new Error('ASSET_HASH_COLLISION');
      }
      return { key, sha256: key, sizeBytes: bytes.length, mime };
    },
    async read(blob: AssetBlob) {
      const b = AssetBlobSchema.parse(blob),
        bytes = await readFile(join(dir, b.key));
      if (
        bytes.length !== b.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== b.sha256
      )
        throw new Error('ASSET_BLOB_CHANGED');
      return bytes;
    },
  };
}

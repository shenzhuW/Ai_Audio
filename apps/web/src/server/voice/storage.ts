import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors';
import type { AudioBlob } from '../../domain/voice';
export function validateAudioUpload(
  name: string,
  bytes: Buffer,
  limit: number,
): { mime: AudioBlob['mime'] } {
  if (!bytes.length || bytes.length > limit)
    throw new AppError('UPLOAD_LIMIT', `音频大小需为1到${limit}字节。`, 413);
  const ext = extname(name).toLowerCase();
  let mime: AudioBlob['mime'] | undefined;
  if (
    ext === '.wav' &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WAVE'
  )
    mime = 'audio/wav';
  if (
    ext === '.mp3' &&
    (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))
  )
    mime = 'audio/mpeg';
  if (
    ext === '.m4a' &&
    bytes.subarray(4, 8).toString() === 'ftyp' &&
    /M4A |isom|mp4[12]/.test(bytes.subarray(8, 32).toString('ascii'))
  )
    mime = 'audio/mp4';
  if (ext === '.flac' && bytes.subarray(0, 4).toString() === 'fLaC') mime = 'audio/flac';
  if ((ext === '.ogg' || ext === '.opus') && bytes.subarray(0, 4).toString() === 'OggS')
    mime = 'audio/ogg';
  if (!mime)
    throw new AppError(
      'INVALID_AUDIO',
      '只接受签名与扩展名一致的WAV/MP3/M4A/FLAC/Ogg音频；播放清单、脚本和视频不接受。',
      400,
    );
  return { mime };
}
export function voiceBlobStore(root: string, limit: number) {
  const file = (id: string) => join(root, z.uuid().parse(id));
  return {
    async put(name: string, bytes: Buffer, id: string = randomUUID()): Promise<AudioBlob> {
      const { mime } = validateAudioUpload(name, bytes, limit);
      await mkdir(root, { recursive: true });
      try {
        await writeFile(file(id), bytes, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if (!(await readFile(file(id))).equals(bytes))
          throw new AppError('BLOB_CONFLICT', '重试内容不同，原音频保留。', 409);
      }
      return {
        id,
        name: name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180),
        mime,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    },
    async read(blob: AudioBlob) {
      const bytes = await readFile(file(blob.id));
      if (
        bytes.length !== blob.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== blob.sha256
      )
        throw new AppError('BLOB_CORRUPT', '音频原件哈希不符。', 409);
      return bytes;
    },
  };
}

import { AppError } from '../errors';
export function byteRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  const invalid = (): never => {
    throw new AppError('INVALID_RANGE', '请求的视频区间无效', 416);
  };
  if (!match || (!match[1] && !match[2])) invalid();
  const start = match![1] ? Number(match![1]) : Math.max(0, size - Number(match![2]));
  const end = match![1] && match![2] ? Math.min(size - 1, Number(match![2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    start > end ||
    (!match![1] && Number(match![2]) <= 0)
  )
    invalid();
  return { start, end, status: 206 };
}

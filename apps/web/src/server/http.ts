import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { AppError } from './errors';
import { isAllowedHost, isSameOrigin, SESSION_COOKIE, sessionKey, verifySession } from './auth';
export async function api(request: NextRequest, action: () => Promise<unknown>, status = 200) {
  const requestId = randomUUID();
  try {
    if (!isAllowedHost(request.headers.get('host')))
      throw new AppError('LOCAL_ONLY', '当前版本仅支持本机访问', 403);
    if (!verifySession(request.cookies.get(SESSION_COOKIE)?.value, sessionKey()))
      throw new AppError('UNAUTHENTICATED', '请打开本机工作台以建立会话', 401);
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      !isSameOrigin(request.headers.get('origin'), request.headers.get('host'))
    )
      throw new AppError('CSRF_BLOCKED', '请求来源不匹配，请在本机工作台重试', 403);
    return NextResponse.json(
      { data: await action(), meta: { requestId } },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const error =
      e instanceof AppError
        ? e
        : e instanceof ZodError || e instanceof SyntaxError
          ? new AppError('VALIDATION_ERROR', '请求内容无效', 400)
          : new AppError('INTERNAL_ERROR', '服务暂时不可用，请重试；数据不会被覆盖', 500);
    if (error.status === 500) console.error(JSON.stringify({ requestId, code: error.code }));
    return NextResponse.json(
      {
        error: { code: error.code, message: error.message, details: error.details },
        meta: { requestId },
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export async function limitedBody(request: NextRequest, max: number): Promise<Buffer> {
  if (Number(request.headers.get('content-length')) > max)
    throw new AppError('UPLOAD_LIMIT', '请求超过当前上传大小限制', 413);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('VALIDATION_ERROR', '请求内容为空');
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError('UPLOAD_LIMIT', '请求超过当前上传大小限制', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

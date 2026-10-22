import { NextRequest, NextResponse } from 'next/server';
import {
  isAllowedHost,
  SESSION_COOKIE,
  sessionKey,
  signSession,
  verifySession,
} from './server/auth';
export function middleware(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith('/api/');
  const deny = (status: number, code: string, message: string) =>
    api
      ? NextResponse.json(
          { error: { code, message }, meta: { requestId: crypto.randomUUID() } },
          { status },
        )
      : new NextResponse(
          `<html lang="zh-CN"><meta charset="utf-8"><body><h1>${message}</h1><p>请使用 http://127.0.0.1:3000 访问本机工作台。</p></body></html>`,
          { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
  if (!isAllowedHost(request.headers.get('host')))
    return deny(403, 'LOCAL_ONLY', '当前工作台仅支持本机访问');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return deny(403, 'CSRF_BLOCKED', '已阻止跨站请求');
  const key = sessionKey();
  const valid = verifySession(request.cookies.get(SESSION_COOKIE)?.value, key);
  if (api && !valid) return deny(401, 'UNAUTHENTICATED', '会话失效，请重新打开工作台');
  const response = NextResponse.next();
  if (!valid)
    response.cookies.set(SESSION_COOKIE, signSession(key), {
      httpOnly: true,
      sameSite: 'strict',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 43200,
    });
  return response;
}
export const config = {
  matcher: ['/projects/:path*', '/api/:path*', '/demo/:path*'],
  runtime: 'nodejs',
};

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
export const SESSION_COOKIE = 'studio_session';
const lifetime = 12 * 3600000;
export function sessionKey(): string {
  const dir = resolve(process.env.STUDIO_DATA_DIR || '.data');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'session-key');
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    return readFileSync(path, 'utf8');
  }
}
export function signSession(key: string, now = Date.now()): string {
  const payload = `local-user.${now + lifetime}`;
  return `${payload}.${createHmac('sha256', key).update(payload).digest('hex')}`;
}
export function verifySession(token: string | undefined, key: string, now = Date.now()): boolean {
  if (!token) return false;
  const [actor, expiry, signature, extra] = token.split('.');
  if (
    extra ||
    actor !== 'local-user' ||
    !/^\d+$/.test(expiry || '') ||
    Number(expiry) <= now ||
    Number(expiry) > now + lifetime ||
    !/^[a-f0-9]{64}$/.test(signature || '')
  )
    return false;
  const expected = createHmac('sha256', key).update(`${actor}.${expiry}`).digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
export function isAllowedHost(host: string | null): boolean {
  return !!host && /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host);
}
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !isAllowedHost(host)) return false;
  try {
    const u = new URL(origin);
    return ['http:', 'https:'].includes(u.protocol) && u.host === host;
  } catch {
    return false;
  }
}

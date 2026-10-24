// Public media only. Host allowlist + every-hop DNS/IP pinning, no cookies/auth/browser.
const https = require('node:https'),
  dns = require('node:dns/promises'),
  { isIP } = require('node:net'),
  { createHash } = require('node:crypto');
const { checkedUrl, publicIPv4 } = require('./public-fetch.cjs');
const hosts = new Set([
  'images-api.nasa.gov',
  'images-assets.nasa.gov',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
]);
function checkedAssetUrl(raw) {
  const u = checkedUrl(raw);
  if (
    u.protocol !== 'https:' ||
    !hosts.has(u.hostname) ||
    u.searchParams.has('token') ||
    u.searchParams.has('key')
  )
    throw Error('FETCH_URL_BLOCKED');
  return u;
}
let nextRequest = 0;
async function pause(ms, signal) {
  if (signal?.aborted) throw Error('FETCH_ABORTED');
  return new Promise((ok, no) => {
    const abort = () => {
      clearTimeout(t);
      no(Error('FETCH_ABORTED'));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      ok();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
async function fetchAsset(
  raw,
  {
    signal,
    maxBytes = 64 * 1024 * 1024,
    timeoutMs = 30000,
    json = false,
    lookup = dns.resolve4,
    request = https.get,
  } = {},
) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 104857600)
    throw Error('FETCH_SIZE_LIMIT');
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs),
    started = Date.now();
  try {
    let url = checkedAssetUrl(raw),
      retries = 0;
    for (let redirects = 0; redirects <= 3;) {
      if (controller.signal.aborted) throw Error('FETCH_ABORTED');
      const wait = Math.max(0, nextRequest - Date.now());
      nextRequest = Math.max(Date.now(), nextRequest) + 1000;
      if (wait) await pause(wait, controller.signal);
      const addresses = await Promise.race([
        isIP(url.hostname) === 4 ? Promise.resolve([url.hostname]) : lookup(url.hostname),
        new Promise((_, reject) => {
          if (controller.signal.aborted) return reject(Error('FETCH_ABORTED'));
          controller.signal.addEventListener('abort', () => reject(Error('FETCH_ABORTED')), {
            once: true,
          });
        }),
      ]);
      if (!addresses.length || !addresses.every(publicIPv4)) throw Error('FETCH_DNS_BLOCKED');
      const address = addresses[0];
      const out = await new Promise((ok, no) => {
        const req = request(
          url,
          {
            signal: controller.signal,
            family: 4,
            lookup: (_h, o, cb) => cb(null, o.all ? [{ address, family: 4 }] : address, 4),
            headers: {
              'User-Agent':
                'AI-Code-Video-Studio/0.1 (local development; https://github.com/shenzhuW/Ai_Audio)',
              Accept: json ? 'application/json' : 'image/png,image/jpeg,video/mp4,video/webm',
              'Accept-Encoding': 'identity',
            },
          },
          (res) => {
            const status = res.statusCode;
            if ([301, 302, 303, 307, 308].includes(status)) {
              res.destroy();
              ok({ location: res.headers.location });
              return;
            }
            if ([429, 503].includes(status)) {
              res.destroy();
              ok({ retry: true });
              return;
            }
            if (status !== 200) {
              res.destroy();
              no(Error('FETCH_HTTP_' + status));
              return;
            }
            const type = String(res.headers['content-type'] || '').toLowerCase();
            if (
              !(
                json
                  ? /^application\/json(?:;|$)/
                  : /^(image\/(png|jpeg)|video\/(mp4|webm)|application\/octet-stream)(?:;|$)/
              ).test(type) ||
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
            ) {
              res.destroy();
              no(Error('FETCH_CONTENT_TYPE'));
              return;
            }
            if (Number(res.headers['content-length'] || 0) > maxBytes) {
              res.destroy();
              no(Error('FETCH_SIZE_LIMIT'));
              return;
            }
            let size = 0;
            const chunks = [];
            res.on('data', (b) => {
              size += b.length;
              if (size > maxBytes) res.destroy(Error('FETCH_SIZE_LIMIT'));
              else chunks.push(b);
            });
            res.on('error', no);
            res.on('end', () => ok({ bytes: Buffer.concat(chunks), type, status }));
          },
        );
        req.on('error', no);
      });
      if (out.location) {
        if (redirects++ === 3) throw Error('FETCH_REDIRECT_LIMIT');
        url = checkedAssetUrl(new URL(out.location, url).href);
        continue;
      }
      if (out.retry) {
        if (retries++ >= 2) throw Error('FETCH_RATE_LIMIT');
        await pause(1000 * 2 ** retries, controller.signal);
        continue;
      }
      if (!out.bytes?.length) throw Error('FETCH_EMPTY');
      return {
        ...out,
        url: url.href,
        sha256: createHash('sha256').update(out.bytes).digest('hex'),
        durationMs: Date.now() - started,
      };
    }
    throw Error('FETCH_REDIRECT_LIMIT');
  } catch (e) {
    throw Error(
      controller.signal.aborted
        ? 'FETCH_ABORTED'
        : /^FETCH_[A-Z0-9_]+$/.test(e.message)
          ? e.message
          : 'FETCH_NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
module.exports = { checkedAssetUrl, fetchAsset };

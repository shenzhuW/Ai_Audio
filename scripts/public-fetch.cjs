// Static public HTTP text only: no browser, scripts, cookies, credentials or model-directed headers.
const dns = require('node:dns/promises');
const http = require('node:http');
const https = require('node:https');
const { isIP } = require('node:net');
const { createHash } = require('node:crypto');
function publicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
function checkedUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Error('FETCH_URL_BLOCKED');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.href.length > 2000 ||
    !url.hostname.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|home|test|invalid)$/.test(url.hostname) ||
    (isIP(url.hostname) && !publicIPv4(url.hostname)) ||
    url.hostname.startsWith('[')
  )
    throw Error('FETCH_URL_BLOCKED');
  url.hash = '';
  return url;
}
function htmlText(html) {
  return html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const number = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name],
    )
    .replace(/\s+/g, ' ')
    .trim();
}
async function fetchPage(
  raw,
  { signal, maxBytes = 1024 * 1024, timeoutMs = 15000, lookup = dns.resolve4 } = {},
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    let url = checkedUrl(raw);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (controller.signal.aborted) throw Error('FETCH_ABORTED');
      const addresses =
        isIP(url.hostname) === 4
          ? [url.hostname]
          : await new Promise((resolve, reject) => {
              const cancelled = () => reject(Error('FETCH_ABORTED'));
              controller.signal.addEventListener('abort', cancelled, { once: true });
              Promise.resolve()
                .then(() => lookup(url.hostname))
                .then(resolve, reject)
                .finally(() => controller.signal.removeEventListener('abort', cancelled));
            });
      if (!addresses.length || !addresses.every(publicIPv4)) throw Error('FETCH_DNS_BLOCKED');
      const address = addresses[0];
      const page = await new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).get(
          url,
          {
            signal: controller.signal,
            family: 4,
            lookup: (_hostname, options, cb) =>
              cb(null, options.all ? [{ address, family: 4 }] : address, 4),
            headers: {
              'User-Agent': 'AI-Code-Video-Studio-Research/0.1',
              Accept: 'text/html,text/plain',
              'Accept-Encoding': 'identity',
            },
          },
          (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
              const location = res.headers.location;
              res.destroy();
              resolve({ location });
              return;
            }
            if (res.statusCode !== 200) {
              res.destroy();
              reject(Error('FETCH_HTTP_ERROR'));
              return;
            }
            const type = String(res.headers['content-type'] || '').toLowerCase();
            if (
              !/^(text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/.test(type) ||
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
            ) {
              res.destroy();
              reject(Error('FETCH_CONTENT_TYPE'));
              return;
            }
            if (Number(res.headers['content-length'] || 0) > maxBytes) {
              res.destroy();
              reject(Error('FETCH_SIZE_LIMIT'));
              return;
            }
            const parts = [];
            let size = 0;
            res.on('data', (b) => {
              size += b.length;
              if (size > maxBytes) res.destroy(Error('FETCH_SIZE_LIMIT'));
              else parts.push(b);
            });
            res.on('error', reject);
            res.on('end', () => resolve({ bytes: Buffer.concat(parts), contentType: type }));
          },
        );
        req.on('error', reject);
      });
      if ('location' in page) {
        if (!page.location || redirects === 3) throw Error('FETCH_REDIRECT_LIMIT');
        url = checkedUrl(new URL(page.location, url).href);
        continue;
      }
      const rawText = new TextDecoder('utf-8', { fatal: true }).decode(page.bytes);
      const text = page.contentType.startsWith('text/plain') ? rawText : htmlText(rawText);
      if (!text.trim()) throw Error('FETCH_EMPTY_TEXT');
      return {
        finalUrl: url.href,
        contentType: page.contentType,
        rawBytes: page.bytes,
        rawSha256: createHash('sha256').update(page.bytes).digest('hex'),
        text: text.slice(0, 100000),
        truncated: text.length > 100000,
        fetchedAt: new Date().toISOString(),
      };
    }
    throw Error('FETCH_REDIRECT_LIMIT');
  } catch (e) {
    throw Error(
      /^FETCH_[A-Z_]+$/.test(e.message)
        ? e.message
        : controller.signal.aborted
          ? 'FETCH_ABORTED'
          : 'FETCH_NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
module.exports = { fetchPage, publicIPv4, htmlText, checkedUrl };

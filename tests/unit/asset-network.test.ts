import test from 'node:test';
import assert from 'node:assert/strict';
const { checkedAssetUrl, fetchAsset } = require('../../scripts/asset-fetch.cjs');
const { Readable } = require('node:stream'),
  { EventEmitter } = require('node:events');
function response(status: number, headers: object, chunks: Buffer[] = []) {
  return (_url: URL, opts: any, callback: any) => {
    const req = new EventEmitter(),
      res = Readable.from(chunks);
    (res as any).statusCode = status;
    (res as any).headers = headers;
    queueMicrotask(() => callback(res));
    opts.signal.addEventListener('abort', () => req.emit('error', Error('aborted')), {
      once: true,
    });
    return req;
  };
}
test('Asset downloader rechecks redirect host and DNS, rejects streamed oversize and HTML', async () => {
  const url = 'https://images-assets.nasa.gov/blocked-test',
    lookup = async () => ['8.8.8.8'];
  await assert.rejects(
    fetchAsset(url, {
      lookup,
      timeoutMs: 5000,
      request: response(302, { location: 'https://127.0.0.1/private' }),
    }),
    /FETCH_URL_BLOCKED/,
  );
  let lookups = 0;
  await assert.rejects(
    fetchAsset(url, {
      lookup: async () => (++lookups === 1 ? ['8.8.8.8'] : ['169.254.169.254']),
      timeoutMs: 5000,
      request: response(302, { location: 'https://images-assets.nasa.gov/redirect' }),
    }),
    /FETCH_DNS_BLOCKED/,
  );
  await assert.rejects(
    fetchAsset(url, {
      lookup,
      maxBytes: 100,
      timeoutMs: 5000,
      request: response(200, { 'content-type': 'image/jpeg' }, [
        Buffer.alloc(80),
        Buffer.alloc(80),
      ]),
    }),
    /FETCH_SIZE_LIMIT/,
  );
  await assert.rejects(
    fetchAsset(url, {
      lookup,
      timeoutMs: 5000,
      request: response(200, { 'content-type': 'text/html' }, [Buffer.from('<html>')]),
    }),
    /FETCH_CONTENT_TYPE/,
  );
  await assert.rejects(
    fetchAsset(url, { lookup: () => new Promise(() => {}), timeoutMs: 10 }),
    /FETCH_ABORTED/,
  );
});
test('Asset downloader blocks arbitrary domains, localhost, credentials and non HTTPS redirects', () => {
  for (const url of [
    'http://images-assets.nasa.gov/a',
    'https://127.0.0.1/a',
    'https://evil.test/a',
    'https://user:secret@images-assets.nasa.gov/a',
    'https://images-assets.nasa.gov:444/a',
  ])
    assert.throws(() => checkedAssetUrl(url));
  assert.equal(
    checkedAssetUrl('https://images-assets.nasa.gov/image/a.jpg').hostname,
    'images-assets.nasa.gov',
  );
});
test('Asset downloader rejects mixed public/private DNS before opening a connection', async () => {
  await assert.rejects(
    fetchAsset('https://images-assets.nasa.gov/a.jpg', {
      lookup: async () => ['8.8.8.8', '10.0.0.1'],
    }),
    /FETCH_DNS_BLOCKED/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    fetchAsset('https://images-assets.nasa.gov/a.jpg', { signal: controller.signal }),
    /FETCH_ABORTED/,
  );
});

// Optional live public-provider capability check. No mock results and no API credentials.
require('../../scripts/register-typescript.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { searchProvider } = require('../../scripts/asset-providers.cjs'),
  { fetchAsset } = require('../../scripts/asset-fetch.cjs'),
  { assetStore } = require('../../apps/web/src/server/assets/storage.ts'),
  { indexSource, limits } = require('../../scripts/asset-media.cjs');
(async () => {
  const dir = path.resolve('.cache/phase07/provider-probe', Date.now().toString(36)),
    evidence = path.resolve('docs/evidence/phase07/providers');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  const results = [];
  for (const [provider, kind, query] of [
    ['commons', 'image', 'Earth Apollo 17'],
    ['nasa', 'video', 'Earth rotation'],
  ]) {
    const controller = new AbortController(),
      found = await searchProvider(provider, query, controller.signal, kind);
    assert.ok(found.sources.length, 'No actual provider results');
    const first = found.sources[0],
      r = await fetchAsset(first.downloadUrl, {
        signal: controller.signal,
        maxBytes: limits().bytes,
      });
    const source = await indexSource(
      { ...first, blob: await assetStore(dir).put(r.bytes) },
      dir,
      path.join(dir, provider + '-' + kind),
      controller.signal,
    );
    assert.equal(source.metadata.kind, kind);
    fs.copyFileSync(
      path.join(dir, 'asset-blobs', source.index.contactSheet.key),
      path.join(evidence, provider + '-' + kind + '-contact.jpg'),
    );
    results.push({
      record: found.record,
      source,
      capability:
        'real search/download/FFprobe/sparse frame indexing; no semantic model conclusion in this probe',
    });
  }
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ status: 'PASS', at: new Date().toISOString(), results }, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        sources: results.map((x) => ({
          provider: x.source.provider,
          url: x.source.sourceUrl,
          metadata: x.source.metadata,
        })),
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e.code || e.message);
  process.exitCode = 1;
});

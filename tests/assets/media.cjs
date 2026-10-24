// Real media regression, not mocked timing or FFprobe.
require('../../scripts/register-typescript.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const { assetStore } = require('../../apps/web/src/server/assets/storage.ts'),
  { recipeHash } = require('../../apps/web/src/server/assets/recipe.ts'),
  { indexSource, prepare, ffmpeg } = require('../../scripts/asset-media.cjs');
(async () => {
  const dir = path.resolve('.cache/phase07/media-regression', Date.now().toString(36));
  fs.mkdirSync(dir, { recursive: true });
  const bytes = fs.readFileSync(path.resolve('fixtures/assets/gpu-two-scenes.mp4')),
    store = assetStore(dir),
    blob = await store.put(bytes);
  const source = await indexSource(
    { id: randomUUID(), kind: 'video', blob, localRef: null, metadata: null, index: null },
    dir,
    path.join(dir, 'index'),
    new AbortController().signal,
  );
  const results = [];
  for (const [i, mode, start, end] of [
    [0, 'loop', 0, 6000],
    [1, 'freeze', 6000, 12000],
    [2, 'once', 1000, 11000],
  ]) {
    const recipe = {
        version: 1,
        sourceSha256: blob.sha256,
        sourceInMs: start,
        sourceOutMs: end,
        width: 1080,
        height: 1920,
        fps: 30,
        frames: 300,
        fit: 'cover',
        x: 0.5,
        y: 0.5,
        playback: mode,
        mute: true,
      },
      binding = { id: randomUUID(), recipe, recipeHash: recipeHash(recipe) };
    const result = await prepare(
      source,
      binding,
      dir,
      path.join(dir, 'output-' + i),
      new AbortController().signal,
    );
    assert.equal(result.prepared.metadata.frames, 300);
    assert.equal(result.prepared.metadata.durationMs, 10000);
    const file = path.join(dir, 'asset-blobs', result.prepared.blob.key);
    const samples = [];
    for (const t of mode === 'freeze' ? [0, 7, 9.9] : [0, 5.9]) {
      const raw = path.join(dir, `sample-${i}-${t}.rgb`);
      await ffmpeg([
        '-v',
        'error',
        '-i',
        file,
        '-ss',
        String(t),
        '-frames:v',
        '1',
        '-vf',
        'scale=1:1',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-y',
        raw,
      ]);
      samples.push([...fs.readFileSync(raw)]);
    }
    if (mode === 'loop')
      assert.ok(
        samples.every(([r, g, b]) => b > g),
        'Loop must stay in scene A',
      );
    if (mode === 'freeze') {
      assert.ok(
        samples.every(([r, g, b]) => g > b),
        'Freeze must stay in scene B',
      );
      assert.ok(
        samples[1].every((x, k) => Math.abs(x - samples[2][k]) <= 1),
        'Padded tail should hold the final selected frame',
      );
    }
    const hit = await prepare(
      source,
      binding,
      dir,
      path.join(dir, 'cache-' + i),
      new AbortController().signal,
    );
    assert.equal(hit.cacheHit, true);
    assert.equal(hit.prepared.blob.sha256, result.prepared.blob.sha256);
    results.push({
      mode,
      inputInterval: [start, end],
      metadata: result.prepared.metadata,
      meanRgbSamples: samples,
      cacheHit: hit.cacheHit,
    });
  }
  assert.deepEqual(await store.read(blob), bytes);
  // Container/audio may outlast video. Index against the actual video stream end.
  const overhang = path.join(dir, 'audio-overhang.mp4');
  await ffmpeg([
    '-v',
    'error',
    '-i',
    path.join(dir, 'asset-blobs', blob.key),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=300:sample_rate=22050:duration=12.4',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-y',
    overhang,
  ]);
  const overBlob = await store.put(fs.readFileSync(overhang));
  const indexedOver = await indexSource(
    {
      id: randomUUID(),
      kind: 'video',
      blob: overBlob,
      localRef: null,
      metadata: null,
      index: null,
    },
    dir,
    path.join(dir, 'overhang-index'),
    new AbortController().signal,
  );
  assert.equal(indexedOver.metadata.durationMs, 12000);
  assert.equal(indexedOver.index.frames.length, 6);
  results.push({
    case: 'container/audio overhang',
    durationMs: indexedOver.metadata.durationMs,
    actualPts: indexedOver.index.frames.map((f) => f.atMs),
  });
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        sourceMetadata: source.metadata,
        actualPts: source.index.frames.map((f) => f.atMs),
        results,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e.stack, e.diagnostic || '');
  process.exitCode = 1;
});

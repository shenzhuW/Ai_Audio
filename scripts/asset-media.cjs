require('./register-typescript.cjs');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID, createHash } = require('node:crypto'),
  { execFile } = require('node:child_process'),
  { promisify } = require('node:util');
const { assetStore } = require('../apps/web/src/server/assets/storage.ts');
const { validateRange, recipeHash } = require('../apps/web/src/server/assets/recipe.ts');
const { isolatedEnvironment } = require('./render-worker.cjs');
const exec = promisify(execFile),
  hash = (b) => createHash('sha256').update(b).digest('hex');
function limits() {
  const number = (k, d, max) => {
    const x = Number(process.env[k] || d);
    if (!Number.isInteger(x) || x < 1 || x > max) throw Error('ASSET_LIMIT_CONFIGURATION');
    return x;
  };
  return {
    bytes: number('STUDIO_ASSET_MAX_MB', 64, 100) * 1048576,
    durationMs: number('STUDIO_ASSET_MAX_SECONDS', 180, 600) * 1000,
  };
}
async function tool(exe, args, signal, timeout = 90000) {
  try {
    return await exec(exe, args, {
      signal,
      timeout,
      maxBuffer: 8 * 1048576,
      windowsHide: true,
      env: isolatedEnvironment(),
    });
  } catch (e) {
    if (signal?.aborted) throw Error('ASSET_CANCELLED');
    if (e.killed) throw Error('ASSET_MEDIA_TIMEOUT');
    const x = Error('ASSET_MEDIA_FAILED');
    x.diagnostic = String(e.stderr || '').slice(-6000);
    throw x;
  }
}
const ffmpeg = (args, signal) =>
  tool(
    process.env.STUDIO_FFMPEG_PATH || 'ffmpeg',
    ['-hide_banner', '-nostdin', '-threads', '2', ...args],
    signal,
  );
async function probe(file, signal) {
  const r = await tool(
    process.env.STUDIO_FFPROBE_PATH || process.env.FFPROBE_PATH || 'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      file,
    ],
    signal,
    30000,
  );
  const j = JSON.parse(r.stdout),
    v = j.streams?.find((x) => x.codec_type === 'video');
  if (
    !v ||
    !v.width ||
    !v.height ||
    v.width * v.height > 40000000 ||
    v.width > 16384 ||
    v.height > 16384
  )
    throw Error('ASSET_DIMENSIONS_INVALID');
  const image =
    ['png', 'mjpeg'].includes(v.codec_name) &&
    !j.format.format_name.includes('mp4') &&
    !j.format.format_name.includes('matroska');
  const fps = Number(v.avg_frame_rate?.split('/')[0]) / Number(v.avg_frame_rate?.split('/')[1]);
  const durationMs = image ? null : Math.round(Number(v.duration || j.format.duration) * 1000);
  if (
    !image &&
    (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > limits().durationMs)
  )
    throw Error('ASSET_DURATION_LIMIT');
  if (!image && !['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4'].includes(v.codec_name))
    throw Error('ASSET_CODEC_UNSUPPORTED');
  return {
    metadata: {
      kind: image ? 'image' : 'video',
      width: v.width,
      height: v.height,
      durationMs,
      fps: image ? 0 : fps,
      codec: v.codec_name,
      format: j.format.format_name,
      frames: image ? null : /^\d+$/.test(String(v.nb_frames)) ? Number(v.nb_frames) : null,
    },
    raw: j,
  };
}
async function sourceFile(source, dataDir) {
  if (!source.blob) throw Error('ASSET_NOT_DOWNLOADED');
  const file = source.localRef
    ? path.join(dataDir, source.localRef.area, source.localRef.id)
    : path.join(dataDir, 'asset-blobs', source.blob.key);
  const bytes = await fs.readFile(file);
  if (bytes.length !== source.blob.sizeBytes || hash(bytes) !== source.blob.sha256)
    throw Error('ASSET_SOURCE_CHANGED');
  return file;
}
async function indexSource(source, dataDir, dir, signal) {
  const file = await sourceFile(source, dataDir),
    { metadata } = await probe(file, signal),
    store = assetStore(dataDir);
  if (metadata.kind !== source.kind) throw Error('ASSET_CONTENT_INVALID');
  if (source.index?.sourceSha256 === source.blob.sha256 && source.index.version === 1)
    return { ...source, metadata, status: 'indexed' };
  await fs.mkdir(dir, { recursive: true });
  const times =
    metadata.kind === 'image'
      ? [0]
      : Array.from({ length: 6 }, (_, i) =>
          Math.floor((i * Math.max(0, metadata.durationMs - 100)) / 5),
        );
  const frames = [];
  for (let i = 0; i < times.length; i++) {
    const name = path.join(dir, 'frame-' + i + '.jpg'),
      t = times[i] / 1000;
    const filter =
      (metadata.kind === 'image' ? '' : `select=gte(t\\,${t}),`) + 'scale=480:-2,showinfo';
    const r = await ffmpeg(
      [
        '-v',
        'info',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        file,
        '-an',
        '-vf',
        filter,
        '-vsync',
        '0',
        '-frames:v',
        '1',
        '-q:v',
        '3',
        '-y',
        name,
      ],
      signal,
    );
    const pts = [...r.stderr.matchAll(/\bpts_time:([\d.]+)/g)].map((x) => Number(x[1]));
    if (metadata.kind === 'video' && !pts.length) throw Error('ASSET_FRAME_PTS_MISSING');
    const atMs = metadata.kind === 'image' ? 0 : Math.round(pts[0] * 1000),
      blob = await store.put(await fs.readFile(name));
    frames.push({ id: randomUUID(), atMs, blob });
  }
  const inputs = frames.flatMap((_, i) => ['-i', path.join(dir, 'frame-' + i + '.jpg')]);
  // Labels are numeric actual decoded PTS, never model-generated text or shell strings.
  const font = process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : '';
  const labels = frames
    .map(
      (f, i) =>
        `[${i}:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:210:(ow-iw)/2:0:black,drawtext=${font}text='${(f.atMs / 1000).toFixed(3)}s':fontcolor=white:fontsize=18:x=8:y=186[s${i}]`,
    )
    .join(';');
  const layout = frames.map((_, i) => `${(i % 3) * 320}_${Math.floor(i / 3) * 210}`).join('|');
  const sheet = path.join(dir, 'contact.jpg');
  if (frames.length === 1) await fs.copyFile(path.join(dir, 'frame-0.jpg'), sheet);
  else
    await ffmpeg(
      [
        '-v',
        'error',
        ...inputs,
        '-filter_complex',
        labels +
          ';' +
          frames.map((_, i) => `[s${i}]`).join('') +
          `xstack=inputs=${frames.length}:layout=${layout}[out]`,
        '-map',
        '[out]',
        '-frames:v',
        '1',
        '-q:v',
        '3',
        '-y',
        sheet,
      ],
      signal,
    );
  let cuts = [];
  if (metadata.kind === 'video') {
    const r = await ffmpeg(
      [
        '-v',
        'info',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        file,
        '-an',
        '-vf',
        'scale=160:-2,select=gt(scene\\,0.3),showinfo',
        '-vsync',
        '0',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    cuts = [...r.stderr.matchAll(/\bpts_time:([\d.]+)/g)]
      .map((x) => Math.round(Number(x[1]) * 1000))
      .filter((x) => x > 0 && x < metadata.durationMs)
      .slice(0, 1000);
  }
  const gray = path.join(dir, 'gray.raw');
  await ffmpeg(
    [
      '-v',
      'error',
      '-i',
      path.join(dir, 'frame-0.jpg'),
      '-vf',
      'scale=64:64,format=gray',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-y',
      gray,
    ],
    signal,
  );
  const pixels = await fs.readFile(gray);
  let edge = 0;
  for (let y = 1; y < 64; y++)
    for (let x = 1; x < 64; x++) {
      const n = y * 64 + x;
      edge += Math.abs(pixels[n] - pixels[n - 1]) + Math.abs(pixels[n] - pixels[n - 64]);
    }
  return {
    ...source,
    metadata,
    index: {
      version: 1,
      sourceSha256: source.blob.sha256,
      frames,
      contactSheet: await store.put(await fs.readFile(sheet)),
      sceneCutsMs: cuts,
      sharpness: edge / (63 * 63 * 2),
      scope: 'sparse_frames',
    },
    status: 'indexed',
  };
}
async function prepare(source, binding, dataDir, dir, signal) {
  const recipe = binding.recipe,
    key = recipeHash(recipe);
  if (key !== binding.recipeHash || source.blob?.sha256 !== recipe.sourceSha256)
    throw Error('ASSET_RECIPE_INVALID');
  const file = await sourceFile(source, dataDir),
    cacheDir = path.join(dataDir, 'asset-cache'),
    manifest = path.join(cacheDir, key + '.json');
  const store = assetStore(dataDir);
  try {
    const p = JSON.parse(await fs.readFile(manifest, 'utf8'));
    if (p.recipeHash !== key || recipeHash(p.recipe) !== key) throw Error('ASSET_CACHE_INVALID');
    await store.read(p.blob);
    const checked = await probe(path.join(dataDir, 'asset-blobs', p.blob.key), signal);
    verifyPrepared(checked.metadata, recipe);
    return {
      prepared: {
        ...p,
        id: randomUUID(),
        producerBindingId: binding.id,
        createdAt: new Date().toISOString(),
      },
      cacheHit: true,
    };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const m = (await probe(file, signal)).metadata;
  validateRange(
    m,
    recipe.sourceInMs,
    recipe.sourceOutMs,
    (recipe.frames / 30) * 1000,
    recipe.playback,
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });
  const out = path.join(dir, 'prepared.mp4'),
    W = recipe.width,
    H = recipe.height;
  const fit =
    recipe.fit === 'contain'
      ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`
      : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-ow)*${recipe.x}:(ih-oh)*${recipe.y}`;
  const encode = [
    '-an',
    '-map_metadata',
    '-1',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ];
  const trim = [
    '-ss',
    String(recipe.sourceInMs / 1000),
    '-t',
    String((recipe.sourceOutMs - recipe.sourceInMs) / 1000),
  ];
  let input = ['-protocol_whitelist', 'file,pipe', '-i', file],
    filters = fit + ',setsar=1,fps=30';
  let log = 'source SHA ' + source.blob.sha256 + '\nrecipe ' + JSON.stringify(recipe) + '\n';
  if (m.kind === 'image') input = ['-loop', '1', '-i', file];
  else if (
    recipe.playback === 'loop' &&
    recipe.sourceOutMs - recipe.sourceInMs < (recipe.frames / 30) * 1000
  ) {
    const chunk = path.join(dir, 'interval.mp4');
    const step = await ffmpeg(
      ['-v', 'error', ...input, ...trim, '-vf', filters, ...encode, '-y', chunk],
      signal,
    );
    log += 'Trim interval before looping: ' + step.stderr + '\n';
    input = ['-stream_loop', '-1', '-i', chunk];
    filters = 'setsar=1,fps=30';
  } else {
    if (recipe.playback === 'freeze') {
      // Trim before padding. Output -t would cut off the padded tail.
      filters = `trim=start=${recipe.sourceInMs / 1000}:end=${recipe.sourceOutMs / 1000},setpts=PTS-STARTPTS,${filters},tpad=stop_mode=clone:stop_duration=${recipe.frames / 30}`;
    } else input.push(...trim);
  }
  const args = [
    '-v',
    'error',
    ...input,
    '-vf',
    filters,
    '-frames:v',
    String(recipe.frames),
    ...encode,
    '-y',
    out,
  ];
  const r = await ffmpeg(args, signal);
  log +=
    'ffmpeg ' +
    JSON.stringify(
      args.map((a) =>
        a === file ? '[source]' : a.startsWith(dir) ? '[work]/' + path.basename(a) : a,
      ),
    ) +
    '\n' +
    r.stderr;
  const checked = await probe(out, signal);
  verifyPrepared(checked.metadata, recipe);
  const blob = await store.put(await fs.readFile(out), 104857600);
  const prepared = {
    id: randomUUID(),
    recipeHash: key,
    sourceSha256: source.blob.sha256,
    blob,
    metadata: checked.metadata,
    recipe,
    producerBindingId: binding.id,
    createdAt: new Date().toISOString(),
    log: log.slice(0, 16000),
  };
  try {
    await fs.writeFile(manifest, JSON.stringify(prepared, null, 2), { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const existing = JSON.parse(await fs.readFile(manifest, 'utf8'));
    await store.read(existing.blob);
    return {
      prepared: {
        ...existing,
        id: randomUUID(),
        producerBindingId: binding.id,
        createdAt: new Date().toISOString(),
      },
      cacheHit: true,
    };
  }
  return { prepared, cacheHit: false };
}
function verifyPrepared(m, r) {
  if (
    m.codec !== 'h264' ||
    !m.format.includes('mp4') ||
    m.width !== r.width ||
    m.height !== r.height ||
    m.frames !== r.frames ||
    m.fps !== r.fps ||
    Math.abs(m.durationMs - (r.frames / 30) * 1000) > 34
  )
    throw Error('ASSET_PREPARED_INVALID');
}
module.exports = { probe, sourceFile, indexSource, prepare, limits, ffmpeg };

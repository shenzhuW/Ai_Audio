// Trusted fixed entry only. The coordinator gives this process no application credentials.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
require('./register-typescript.cjs');
const {
  RenderInputSchema,
  RenderResultSchema,
  verifyVideoMetadata,
  renderFiles,
} = require('../apps/web/src/domain/motion.ts');
const { trustedInput } = require('../apps/web/src/server/render/preset.ts');
const { fingerprint } = require('../apps/web/src/server/workflow/engine.ts');
const root = path.resolve(__dirname, '..');
const renderRequire = createRequire(path.join(root, 'apps/render/package.json'));
const { bundle } = renderRequire('@remotion/bundler');
const { renderMedia, renderStill, selectComposition, openBrowser, makeCancelSignal } =
  renderRequire('@remotion/renderer');
const output = path.resolve(process.argv[2]);
const input = RenderInputSchema.parse(
  JSON.parse(fs.readFileSync(path.join(output, 'input.json'), 'utf8')),
);
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const send = (message, progress) => process.send?.({ message, progress });
const { cancelSignal, cancel } = makeCancelSignal();
process.on('message', (message) => {
  if (message === 'cancel') cancel();
});
let browser;
async function main() {
  const title = input.scene.layers.find(
    (l) => l.kind === 'component' && l.component === 'KineticText',
  );
  const actual = trustedInput(title.props.fontSize);
  if (input.preparedBackground) {
    actual.preparedBackground = input.preparedBackground;
    actual.assets.backgroundSha256 = input.preparedBackground.sha256;
  }
  if (fingerprint(input) !== fingerprint(actual))
    throw new Error('INPUT_OR_COMPONENT_HASH_MISMATCH');
  const publicDir = input.preparedBackground
    ? path.join(output, 'public')
    : path.join(root, 'apps/render/public');
  if (
    sha(path.join(publicDir, 'background.mp4')) !== input.assets.backgroundSha256 ||
    sha(path.join(publicDir, 'NotoSansSC-subset.woff2')) !== input.assets.fontSha256
  )
    throw new Error('ASSET_HASH_MISMATCH');
  if (!process.env.STUDIO_CHROMIUM_PATH || !fs.existsSync(process.env.STUDIO_CHROMIUM_PATH))
    throw new Error('CHROMIUM_NOT_CONFIGURED');
  send('正在编译可信预置组件', 0.02);
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'apps/render/src/index.ts'),
    publicDir,
    outDir: path.join(output, 'bundle'),
    onProgress: (p) => send('编译可信组件', p * 0.0007),
  });
  browser = await openBrowser('chrome', {
    browserExecutable: process.env.STUDIO_CHROMIUM_PATH,
    chromeMode: 'chrome-for-testing',
    chromiumOptions: { gl: 'swangle' },
    logLevel: 'error',
  });
  const inputProps = { input };
  const composition = await selectComposition({
    chromeMode: 'chrome-for-testing',
    serveUrl,
    id: 'PocVertical',
    inputProps,
    puppeteerInstance: browser,
  });
  if (
    composition.width !== 1080 ||
    composition.height !== 1920 ||
    composition.fps !== 30 ||
    composition.durationInFrames !== 300
  )
    throw new Error('COMPOSITION_METADATA_MISMATCH');
  send('Remotion 正在渲染 300 帧', 0.08);
  await renderMedia({
    chromeMode: 'chrome-for-testing',
    composition,
    serveUrl,
    inputProps,
    puppeteerInstance: browser,
    outputLocation: path.join(output, 'video.mp4'),
    codec: 'h264',
    crf: 18,
    pixelFormat: 'yuv420p',
    x264Preset: 'fast',
    concurrency: 2,
    cancelSignal,
    logLevel: 'error',
    onProgress: (p) => send(`视频渲染 ${Math.round(p.progress * 100)}%`, 0.08 + p.progress * 0.8),
  });
  const determinism = [];
  for (const frame of [60, 150, 240]) {
    send(`重复渲染关键帧 ${frame}`, 0.9);
    const file = `frame-${String(frame).padStart(3, '0')}.png`;
    const options = {
      chromeMode: 'chrome-for-testing',
      composition,
      serveUrl,
      inputProps,
      puppeteerInstance: browser,
      frame,
      imageFormat: 'png',
      cancelSignal,
      logLevel: 'error',
    };
    await renderStill({ ...options, output: path.join(output, file) });
    await renderStill({ ...options, output: path.join(output, 'repeat-' + file) });
    const first = sha(path.join(output, file)),
      second = sha(path.join(output, 'repeat-' + file));
    if (first !== second) throw new Error('NONDETERMINISTIC_FRAME_' + frame);
    determinism.push({ frame, first, second });
  }
  send('FFprobe 验证实际视频', 0.96);
  const probe = spawnSync(
    process.env.STUDIO_FFPROBE_PATH || 'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(output, 'video.mp4')],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 },
  );
  if (probe.status !== 0) throw new Error('FFPROBE_FAILED: ' + probe.stderr?.slice(-700));
  const raw = JSON.parse(probe.stdout);
  const metadata = verifyVideoMetadata(raw);
  fs.writeFileSync(path.join(output, 'ffprobe.json'), JSON.stringify(raw, null, 2));
  const manifestHash = fingerprint(input);
  fs.writeFileSync(
    path.join(output, 'manifest.json'),
    JSON.stringify(
      {
        input,
        manifestHash,
        previewManifestHash: manifestHash,
        compositionId: 'PocVertical',
        codec: 'h264',
        pixelFormat: 'yuv420p',
        runtime: {
          node: process.version,
          platform: process.platform,
          chromeMode: 'chrome-for-testing',
          gl: 'swangle',
          chromiumSha256: sha(process.env.STUDIO_CHROMIUM_PATH),
          crf: 18,
          concurrency: 2,
        },
      },
      null,
      2,
    ),
  );
  const artifacts = renderFiles.map((file) => ({
    file,
    sha256: sha(path.join(output, file)),
    sizeBytes: fs.statSync(path.join(output, file)).size,
  }));
  const result = RenderResultSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    manifestHash,
    previewManifestHash: manifestHash,
    metadata,
    artifacts,
    determinism,
  });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), {
    flag: 'wx',
  });
  send('媒体规格与重复关键帧校验通过', 0.99);
}
main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((e) => {
    console.error(String(e.stack || e).slice(-3500));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close({ silent: true });
    process.disconnect?.();
  });

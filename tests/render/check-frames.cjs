// Diagnostic: repeat the same frozen frame without re-encoding the entire MP4.
const fs = require('node:fs'),
  path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'apps/render/package.json'));
const { openBrowser, selectComposition, renderStill } = req('@remotion/renderer');
const attempt = path.resolve(process.argv[2]);
if (!attempt.startsWith(path.join(root, '.cache') + path.sep))
  throw Error('Only isolated test attempts are accepted');
const inputProps = { input: JSON.parse(fs.readFileSync(path.join(attempt, 'input.json'))) };
const output = path.join(path.dirname(attempt), 'diagnostic-' + Date.now());
fs.mkdirSync(output);
(async () => {
  const results = [];
  for (const mode of [
    {
      id: 'default',
      chromeMode: 'chrome-for-testing',
      gl: undefined,
      exe: process.env.STUDIO_CHROMIUM_PATH,
    },
    {
      id: 'swangle',
      chromeMode: 'chrome-for-testing',
      gl: 'swangle',
      exe: process.env.STUDIO_CHROMIUM_PATH,
    },
    {
      id: 'shell',
      chromeMode: 'headless-shell',
      gl: undefined,
      exe: 'C:/Users/WZS/AppData/Local/ms-playwright/chromium_headless_shell-1187/chrome-win/headless_shell.exe',
    },
  ]) {
    const options = { chromeMode: mode.chromeMode, chromiumOptions: { gl: mode.gl } };
    const browser = await openBrowser('chrome', {
      ...options,
      browserExecutable: mode.exe,
      logLevel: 'error',
    });
    try {
      const serveUrl = path.join(attempt, 'bundle');
      const composition = await selectComposition({
        ...options,
        serveUrl,
        id: 'PocVertical',
        inputProps,
        puppeteerInstance: browser,
        logLevel: 'error',
      });
      const hashes = [];
      for (let i = 0; i < 8; i++) {
        const file = path.join(output, mode.id + '-' + i + '.png');
        await renderStill({
          ...options,
          serveUrl,
          composition,
          inputProps,
          puppeteerInstance: browser,
          frame: 240,
          imageFormat: 'png',
          output: file,
          logLevel: 'error',
        });
        hashes.push(createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
      }
      const result = {
        mode: mode.id,
        captures: hashes.length,
        uniqueHashes: new Set(hashes).size,
        hashes,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } finally {
      await browser.close({ silent: true });
    }
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

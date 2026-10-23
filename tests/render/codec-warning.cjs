// Negative UI test for a browser build which actually has no H.264 decoder.
const fs = require('node:fs'),
  path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const req = createRequire(path.resolve(__dirname, '../../apps/web/package.json'));
let target = process.argv[2],
  app;
const output = path.resolve(__dirname, '../../docs/evidence/phase02/sqlite');
if (
  target !== '--saved-sqlite' &&
  !/^http:\/\/127\.0\.0\.1:3006\/projects\/[a-f0-9-]{36}\/motion$/.test(target)
)
  throw Error('Only the isolated local test app is accepted');
(async () => {
  if (target === '--saved-sqlite') {
    const saved = JSON.parse(fs.readFileSync(path.join(output, 'results.json')));
    if (
      saved.status !== 'PASS' ||
      !/^[a-z0-9]+$/.test(saved.runId) ||
      !/^[a-f0-9-]{36}$/.test(saved.projectId)
    )
      throw Error('Requires a completed isolated SQLite render run');
    await new Promise((ok, fail) => {
      const socket = require('node:net').createServer();
      socket.once('error', fail);
      socket.listen(3007, '127.0.0.1', () => socket.close(ok));
    });
    const appDir = path.resolve(__dirname, '../../apps/web');
    app = spawn(
      process.execPath,
      [req.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3007'],
      {
        cwd: appDir,
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          DATABASE_URL: '',
          STUDIO_DATA_DIR: path.resolve(__dirname, '../../.cache/phase02', saved.runId),
        },
      },
    );
    target = `http://127.0.0.1:3007/projects/${saved.projectId}/motion`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (app.exitCode !== null) throw Error('Test app stopped');
      try {
        if ((await fetch('http://127.0.0.1:3007/projects')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw Error('Test app startup timeout');
  }
  const browser = await req('playwright').chromium.launch({
    headless: true,
    executablePath: process.env.STUDIO_CHROMIUM_PATH,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const support = await page.evaluate(() =>
      document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'),
    );
    if (support) throw Error('Negative test requires an actual browser without H.264 support');
    await page.goto(target);
    await page
      .getByRole('button', { name: /渲染 \d+ · 执行完成/ })
      .first()
      .click();
    const alert = page.getByRole('alert').filter({ hasText: 'H.264' });
    await alert.waitFor();
    await page.getByRole('link', { name: '下载真实 MP4', exact: true }).waitFor();
    const error = await page.locator('video').evaluate((v) => v.error?.message);
    await page.screenshot({ path: path.join(output, '08-codec-warning.png'), fullPage: true });
    fs.writeFileSync(
      path.join(output, 'codec-warning.json'),
      JSON.stringify(
        {
          status: 'PASS',
          at: new Date().toISOString(),
          codecSupport: support,
          actualMediaError: error,
          visibleWarning: await alert.innerText(),
          downloadStillAvailable: true,
        },
        null,
        2,
      ),
    );
    console.log('PASS actual unsupported-codec UI warning and preserved download');
  } finally {
    await browser.close();
  }
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app && app.exitCode === null) {
      app.kill('SIGTERM');
      await new Promise((r) => app.once('exit', r));
    }
  });

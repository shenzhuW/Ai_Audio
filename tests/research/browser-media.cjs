// Focused read-only browser verification against the two completed isolated integration runs.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process'),
  { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web'),
  req = createRequire(path.join(appDir, 'package.json'));
async function verify(backend) {
  const evidence = path.join(root, 'docs/evidence/phase03', backend),
    saved = JSON.parse(fs.readFileSync(path.join(evidence, 'results.json')));
  if (
    saved.status !== 'PASS' ||
    !/^[a-z0-9]+$/.test(saved.runId) ||
    !/^[a-f0-9-]{36}$/.test(saved.projectId)
  )
    throw Error('Requires completed isolated run');
  let databaseUrl = '';
  if (backend === 'postgresql') {
    if (!/^studio_phase03_[a-z0-9]+$/.test(saved.database)) throw Error('Unexpected test database');
    const c = JSON.parse(
        fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')),
      ),
      url = new URL('postgresql://127.0.0.1:55432/' + saved.database + '?schema=public');
    url.username = c.appUser;
    url.password = c.appPassword;
    databaseUrl = url.href;
  }
  await new Promise((ok, fail) => {
    const s = require('node:net').createServer();
    s.once('error', fail);
    s.listen(3009, '127.0.0.1', () => s.close(ok));
  });
  const app = spawn(
    process.execPath,
    [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3009'],
    {
      cwd: appDir,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        STUDIO_DATA_DIR: path.join(root, '.cache/phase03', saved.runId),
      },
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch('http://127.0.0.1:3009/projects')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw Error('Isolated app startup failed');
    browser = await req('playwright').chromium.launch({
      headless: true,
      executablePath: process.env.STUDIO_UI_BROWSER_PATH || process.env.STUDIO_CHROMIUM_PATH,
    });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1150 } }),
      pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:3009/projects/${saved.projectId}/research`);
    const data = await page.evaluate(
      async (id) => (await (await fetch('/api/v1/projects/' + id + '/research')).json()).data,
      saved.projectId,
    );
    const source = data.sources.find((s) => s.sourceType === 'pdf' && s.metadata?.pages === 1);
    if (!source) throw Error('Missing actual PDF fixture');
    await page
      .getByRole('button', { name: new RegExp(source.title + '.*PDF') })
      .first()
      .click();
    await page
      .getByText(data.indexes.find((x) => x.sourceId === source.id && x.page === 1).summary, {
        exact: true,
      })
      .waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(evidence, '03-overview-viewport.png') });
    const videoSource = data.sources.find(
      (s) => s.sourceType === 'video' && s.metadata?.durationMs === 10000,
    );
    if (!videoSource) throw Error('Missing actual video');
    await page
      .getByRole('button', { name: new RegExp(videoSource.title + '.*VIDEO') })
      .first()
      .click();
    const video = page.locator('video');
    await video.waitFor();
    await video.evaluate(async (v) => {
      v.currentTime = 3.333;
      await v.play();
    });
    await page.waitForFunction(
      () => document.querySelector('video')?.currentTime >= 3.6,
      {},
      { timeout: 10000 },
    );
    const media = await video.evaluate((v) => {
      v.pause();
      return {
        currentTime: v.currentTime,
        duration: v.duration,
        readyState: v.readyState,
        decodedWidth: v.videoWidth,
        decodedHeight: v.videoHeight,
        error: v.error?.message ?? null,
      };
    });
    if (
      media.error ||
      media.decodedWidth !== 1080 ||
      media.decodedHeight !== 1920 ||
      media.duration !== 10 ||
      pageErrors.length
    )
      throw Error('Real video decode failed');
    await page.waitForTimeout(200);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(evidence, '03-video-viewport.png') });
    const result = {
      status: 'PASS',
      at: new Date().toISOString(),
      backend,
      projectId: saved.projectId,
      readOnly: true,
      media,
      pageErrors,
    };
    fs.writeFileSync(
      path.join(evidence, 'browser-media.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log('PASS focused real browser PDF view and video playback: ' + backend);
  } finally {
    if (browser) await browser.close();
    if (app.exitCode === null) {
      const ended = new Promise((r) => app.once('exit', r));
      app.kill();
      await ended;
    }
  }
}
(async () => {
  await verify('sqlite');
  await verify('postgresql');
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

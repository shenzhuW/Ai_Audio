// Recapture existing synthetic runs after UI text changes. No AI calls or data migration.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process'),
  { createRequire } = require('node:module'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web'),
  req = createRequire(path.join(appDir, 'package.json'));
const { publicEvidence } = require('./public-evidence.cjs');
async function capture(backend) {
  const output = path.join(root, 'docs/evidence/phase045', backend),
    result = JSON.parse(fs.readFileSync(path.join(output, 'results.json'), 'utf8'));
  if (result.status !== 'PASS' || !/^[a-z0-9]+$/.test(result.runId))
    throw Error('Only completed synthetic runs may be recaptured');
  const env = {
    ...process.env,
    DATABASE_URL: '',
    STUDIO_CODEX_ENABLED: '1',
    STUDIO_DATA_DIR: path.join(root, '.cache/phase045', result.runId),
  };
  if (backend === 'postgresql') {
    const c = JSON.parse(
      fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json'), 'utf8'),
    );
    if (
      c.host !== '127.0.0.1' ||
      c.port !== 55432 ||
      !/^studio_phase045_[a-z0-9]+$/.test(result.database)
    )
      throw Error('Unsafe database target');
    const u = new URL('postgresql://127.0.0.1:55432/' + result.database + '?schema=public');
    u.username = c.appUser;
    u.password = c.appPassword;
    env.DATABASE_URL = u.href;
  }
  const base = 'http://127.0.0.1:3013';
  let app, browser;
  const record = {
    status: 'RUNNING',
    backend,
    at: new Date().toISOString(),
    pageErrors: [],
    images: [],
  };
  try {
    await new Promise((resolve, reject) => {
      const server = require('node:net').createServer();
      server.once('error', reject);
      server.listen(3013, '127.0.0.1', () => server.close(resolve));
    });
    app = spawn(
      process.execPath,
      [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3013'],
      { cwd: appDir, env, windowsHide: true, stdio: 'ignore' },
    );
    let cookie;
    for (let n = 0; n < 120; n++) {
      if (app.exitCode !== null) throw Error('Capture app exited before readiness');
      try {
        const r = await fetch(base + '/projects');
        if (r.ok) {
          cookie = r.headers.get('set-cookie').split(';')[0];
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!cookie) throw Error('Capture app unavailable');
    const api = async (p) => {
      const r = await fetch(base + '/api/v1' + p, { headers: { Cookie: cookie } });
      if (!r.ok) throw Error('Capture GET failed');
      return (await r.json()).data;
    };
    const research = await api(`/projects/${result.projectId}/research`),
      script = await api(`/projects/${result.projectId}/script`);
    fs.writeFileSync(
      path.join(output, 'research-snapshot.json'),
      JSON.stringify(publicEvidence(research), null, 2) + '\n',
    );
    fs.writeFileSync(
      path.join(output, 'script-snapshot.json'),
      JSON.stringify(publicEvidence(script), null, 2) + '\n',
    );
    browser = await req('playwright').chromium.launch({
      headless: true,
      executablePath:
        process.env.STUDIO_UI_BROWSER_PATH ||
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
    page.on('pageerror', (e) => record.pageErrors.push(e.message));
    const snap = async (name) => {
      await page.evaluate(() => scrollTo(0, 0));
      const bytes = await page.screenshot({ path: path.join(output, name), fullPage: true });
      record.images.push({
        file: name,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      });
    };
    await page.goto(base + `/projects/${result.projectId}/research`);
    await page.getByRole('button', { name: 'Codex 实时搜索', exact: true }).waitFor();
    const web = research.sources.find((s) => s.provenance === 'web-fetch');
    await page
      .getByRole('button')
      .filter({ has: page.locator('b').filter({ hasText: web.title }) })
      .first()
      .click();
    await page.getByText('搜索摘要与网页原文分界', { exact: true }).click();
    await snap('03-real-search.png');
    for (const [name, file] of [
      ['self-authored-chart.png', '03-real-vision.png'],
      ['self-authored-background.mp4', '03-real-video.png'],
    ]) {
      await page
        .getByRole('button')
        .filter({ has: page.locator('b').filter({ hasText: name }) })
        .first()
        .click();
      await snap(file);
    }
    await page.getByText('查看研究任务和日志', { exact: true }).click();
    await snap('03-real-audit.png');
    await page.goto(base + `/projects/${result.projectId}/script`);
    await page.getByRole('textbox', { name: '第2段正文', exact: true }).waitFor();
    if (
      (await page.getByRole('textbox', { name: '第2段正文', exact: true }).inputValue()) !==
      script.segments[1].text
    )
      throw Error('Rendered text differs from saved model result');
    await page.getByText(/查看 \d+ 项文稿任务/).click();
    for (const summary of await page.getByText(/查看 1 次真实模型运行与使用量/).all())
      await summary.click();
    await snap('04-real-script.png');
    await page.setViewportSize({ width: 390, height: 1000 });
    await snap('04-mobile.png');
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)))
      throw Error('Mobile overflow');
    if (record.pageErrors.length) throw Error('Browser errors');
    record.status = 'PASS';
    console.log('PASS ' + backend + ' final browser captures, saved data and mobile');
  } finally {
    if (browser) await browser.close();
    if (app && app.exitCode === null) {
      const done = new Promise((r) => app.once('exit', r));
      app.kill();
      await done;
    }
    fs.writeFileSync(path.join(output, 'captures.json'), JSON.stringify(record, null, 2) + '\n');
  }
}
(async () => {
  for (const backend of process.argv.includes('--postgres') ? ['postgresql'] : process.argv.includes('--sqlite') ? ['sqlite'] : ['sqlite', 'postgresql']) await capture(backend);
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

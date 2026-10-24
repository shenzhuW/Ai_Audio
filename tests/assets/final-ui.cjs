// Final production-build smoke on a COPY of the synthetic Phase07 SQLite database.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  { spawn } = require('node:child_process'),
  { createRequire } = require('node:module'),
  { DatabaseSync, backup } = require('node:sqlite');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web'),
  req = createRequire(path.join(appDir, 'package.json')),
  evidence = path.join(root, 'docs/evidence/phase07/final-ui'),
  prior = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/phase07/sqlite/results.json'))),
  sourceDir = path.join(root, '.cache/phase07', prior.runId),
  dir = path.join(root, '.cache/phase07/final-ui', Date.now().toString(36)),
  base = 'http://127.0.0.1:3030';
let app, browser, cookie;
const output = { status: 'RUNNING', checks: [], pageErrors: [] };
async function api(p, method = 'GET', body) {
  const r = await fetch(base + '/api/v1' + p, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base,
        Connection: 'close',
        ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    b = await r.json();
  assert.ok(r.ok, JSON.stringify(b));
  return b.data;
}
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  const db = new DatabaseSync(path.join(sourceDir, 'studio.db'));
  await backup(db, path.join(dir, 'studio.db'));
  db.close();
  for (const name of ['asset-blobs', 'asset-cache'])
    fs.cpSync(path.join(sourceDir, name), path.join(dir, name), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  const env = { ...process.env, DATABASE_URL: '', STUDIO_DATA_DIR: dir, STUDIO_CODEX_ENABLED: '1' };
  app = spawn(
    process.execPath,
    [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3030'],
    { cwd: appDir, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let log = '';
  app.stderr.on('data', (b) => (log += b));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/projects');
      if (r.ok) {
        cookie = r.headers.get('set-cookie').split(';')[0];
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(cookie, log);
  const { chromium } = req('playwright');
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  page.on('pageerror', (e) => output.pageErrors.push(e.message));
  const p = '/projects/' + prior.projectId,
    w = await api(p + '/assets'),
    old = w.director;
  await page.goto(base + p + '/assets');
  await page.getByLabel('素材镜头').waitFor();
  await page
    .getByRole('button', { name: /GPU schematic two scenes/ })
    .first()
    .click();
  await page
    .locator('video')
    .first()
    .evaluate(
      (v) =>
        new Promise((ok, no) => {
          const seek = () => {
            v.onseeked = ok;
            v.currentTime = 7;
          };
          if (v.readyState >= 1) seek();
          else v.onloadedmetadata = seek;
          v.onerror = no;
        }),
    );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, '07-workspace-viewport.png') });
  const history = page.getByRole('button', { name: /完整任务历史/ });
  await history.click();
  await page.getByRole('button', { name: '仅看最近6项' }).waitFor();
  await page.getByRole('button', { name: '仅看最近6项' }).click();
  output.checks.push({
    name: 'final build library/preview and collapsed complete job history toggle',
    status: 'PASS',
  });
  // Explicit user Fork/approve into the new already approved Voice; do not overwrite old history.
  const wf = await api(p + '/workflow'),
    script = wf.stages.find((x) => x.type === 'script').approvedRevisionId,
    voice = wf.stages.find((x) => x.type === 'voice').approvedRevisionId;
  let next = await api('/artifacts/' + old.artifactId + '/revisions', 'POST', {
    revisionId: old.id,
    expectedVersion: old.version,
    inputRevisionIds: [script, voice],
  });
  next = await api(p + '/director', 'PATCH', {
    revisionId: next.id,
    expectedVersion: next.version,
    shots: w.shots,
  });
  next = await api('/artifacts/' + next.artifactId + '/revisions/' + next.id + '/submit', 'POST', {
    expectedVersion: next.version,
  });
  next = await api('/artifacts/' + next.artifactId + '/revisions/' + next.id + '/approve', 'POST', {
    expectedVersion: next.version,
    comment: 'Synthetic final UI history test',
  });
  const paths = [];
  page.on('response', (r) => {
    if (r.url().includes('/assets')) paths.push(r.url().replace(base, ''));
  });
  await page.goto(base + p + '/storyboard');
  await page
    .getByRole('button', { name: new RegExp('^v' + old.revisionNumber + ' · 已批准') })
    .click();
  await page.getByText('本镜头素材使用方案 · 独立版本', { exact: true }).waitFor();
  for (let i = 0; i < 50 && !paths.some((x) => x.includes('directorRevisionId=' + old.id)); i++)
    await page.waitForTimeout(100);
  assert.ok(paths.some((x) => x.includes('directorRevisionId=' + old.id)));
  const oldView = await api(p + '/assets?directorRevisionId=' + old.id);
  assert.equal(oldView.director.id, old.id);
  assert.ok(oldView.bindings.length >= 3);
  await page.getByText('本镜头素材使用方案 · 独立版本', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, '06-history-binding.png') });
  assert.equal(
    await page.getByRole('button', { name: '搜索并匹配素材', exact: true }).isDisabled(),
    true,
  );
  output.checks.push({
    name: 'page06 historical Director requests its fixed old asset binding and remains readonly',
    status: 'PASS',
    oldDirectorId: old.id,
    newDirectorId: next.id,
    requestPaths: paths,
  });
  assert.deepEqual(output.pageErrors, []);
  output.status = 'PASS';
})()
  .catch((e) => {
    output.status = 'FAIL';
    output.error = e.stack || String(e);
    console.error(output.error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (app && app.exitCode === null) {
      const done = new Promise((r) => app.once('exit', r));
      app.kill();
      await done;
    }
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify(output));
  });

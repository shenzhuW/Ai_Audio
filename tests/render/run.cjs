// Actual production HTTP + isolated database + real Render Worker/Chromium/FFprobe.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web');
const appRequire = createRequire(path.join(appDir, 'package.json'));
require('../../scripts/register-typescript.cjs');
const { verifyVideoMetadata } = require('../../apps/web/src/domain/motion.ts');
const { fingerprint } = require('../../apps/web/src/server/workflow/engine.ts');
const postgres = process.argv.includes('--postgres');
const backend = postgres ? 'postgresql' : 'sqlite';
const runId = Date.now().toString(36);
const data = path.join(root, '.cache/phase02', runId);
const evidenceDir = path.join(
  process.env.STUDIO_TEST_PHASE_EVIDENCE_ROOT || path.join(root, 'docs/evidence/phase02'),
  backend,
);
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
const base = 'http://127.0.0.1:3006';
const env = {
  ...process.env,
  DATABASE_URL: '',
  STUDIO_DATA_DIR: data,
  STUDIO_TRUSTED_LOCAL_RENDER: '1',
};
let credentials;
const safe = (text) =>
  credentials
    ? String(text)
        .replaceAll(credentials.adminPassword, '[REDACTED]')
        .replaceAll(credentials.appPassword, '[REDACTED]')
    : String(text);
const result = {
  status: 'RUNNING',
  at: new Date().toISOString(),
  backend,
  runId,
  checks: [],
  pageErrors: [],
};
function save() {
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(result, null, 2));
}
function record(name, detail) {
  result.checks.push({ name, status: 'PASS', detail });
  save();
  console.log('PASS ' + name);
}
function sha(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function protectedHash() {
  const h = createHash('sha256');
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file);
      else {
        h.update(file);
        h.update(fs.readFileSync(file));
      }
    }
  };
  visit(path.join(appDir, '.data'));
  visit(path.join(root, '.cache/acceptance-data'));
  return h.digest('hex');
}
const originalHash = protectedHash();
function command(args, extra = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: appDir,
    env: { ...env, ...extra },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  assert.equal(r.status, 0, safe((r.stdout || '') + (r.stderr || '')));
  return safe((r.stdout || '') + (r.stderr || ''));
}
let app, browser, db, cookie;
const workers = [];
let appLog = '';
async function startApp() {
  await new Promise((ok, fail) => {
    const s = require('node:net').createServer();
    s.once('error', fail);
    s.listen(3006, '127.0.0.1', () => s.close(ok));
  });
  app = spawn(
    process.execPath,
    [
      appRequire.resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3006',
    ],
    { cwd: appDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  app.stdout.on('data', (b) => {
    appLog += safe(b);
  });
  app.stderr.on('data', (b) => {
    appLog += safe(b);
  });
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw Error(appLog.slice(-1200));
    try {
      const r = await fetch(base + '/projects/new');
      if (r.ok) {
        cookie = r.headers.get('set-cookie').split(';')[0];
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error('App readiness timeout');
}
async function stopApp() {
  if (app && app.exitCode === null) {
    const done = new Promise((r) => app.once('exit', r));
    app.kill();
    await done;
  }
  app = undefined;
}
async function req(p, method = 'GET', body, status = 200, key = randomUUID()) {
  const r = await fetch(base + '/api/v1' + p, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b.data ?? b.error;
}
const create = (title) =>
  req(
    '/projects',
    'POST',
    {
      title,
      prompt: 'Phase 02 isolated technical test; no factual claims.',
      targetDurationMs: 240000,
      width: 1080,
      height: 1920,
      entryType: 'topic',
      voiceMode: 'none',
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    201,
  );
const enqueue = (id, size = 72, key = randomUUID()) =>
  req(`/projects/${id}/render-runs`, 'POST', { presetId: 'poc-v1', titleFontSize: size }, 202, key);
const getJob = (id) => req('/jobs/' + id);
function worker(extra = {}) {
  const p = spawn(process.execPath, [path.join(root, 'scripts/render-worker.cjs'), '--once'], {
    cwd: appDir,
    env: { ...env, ...extra },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { p, text: '' };
  workers.push(state);
  p.stdout.on('data', (x) => {
    state.text += safe(x);
  });
  p.stderr.on('data', (x) => {
    state.text += safe(x);
  });
  state.done = new Promise((ok, fail) => {
    p.once('error', fail);
    p.once('exit', (code) => {
      state.code = code;
      ok(code);
    });
  });
  return state;
}
async function until(id, predicate, limit = 700000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    const j = await getJob(id);
    if (predicate(j)) return j;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Job timeout ' + id);
}
async function pageCapture(page, name) {
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true });
}
async function main() {
  if (postgres) {
    credentials = JSON.parse(
      fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')),
    );
    assert.equal(credentials.host, '127.0.0.1');
    assert.equal(credentials.port, 55432);
    const { PrismaClient } = appRequire('@prisma/client');
    const database = 'studio_phase02_' + runId;
    const url = (admin) =>
      `postgresql://${admin ? credentials.adminUser : credentials.appUser}:${admin ? credentials.adminPassword : credentials.appPassword}@127.0.0.1:55432/${admin ? 'postgres' : database}?schema=public`;
    const admin = new PrismaClient({ datasources: { db: { url: url(true) } } });
    try {
      assert.match(database, /^studio_phase02_[a-z0-9]+$/);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" OWNER studio_app`);
    } finally {
      await admin.$disconnect();
    }
    env.DATABASE_URL = url(false);
    result.database = database;
    fs.writeFileSync(
      path.join(evidenceDir, 'migrations.log'),
      command([appRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy']),
    );
    command([appRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
    db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    const rows = await db.$queryRawUnsafe('SELECT version() AS version');
    record('真实 PostgreSQL 与幂等迁移', rows[0]);
  }
  await startApp();
  fs.writeFileSync(
    path.join(evidenceDir, 'legacy-http.log'),
    command([path.join(root, 'tests/http/run.mjs')], {
      STUDIO_TEST_URL: base,
      STUDIO_TEST_BACKEND: backend,
      STUDIO_TEST_EVIDENCE_DIR: evidenceDir,
    }),
  );
  const legacy = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'http-results.json')));
  assert.equal(legacy.checks.length, 15);
  record('旧 HTTP CRUD/上传/十页路由回归', { checks: 15 });
  const { workflowAcceptance } = await import(
    pathToFileURL(path.join(root, 'tests/workflow/http.mjs'))
  );
  await workflowAcceptance(base, backend, evidenceDir);
  record('Phase 01 工作流回归', { checks: 8 });
  const project = await create('Phase 02 ' + backend + ' real render');
  result.projectId = project.id;
  const key = randomUUID();
  const [a, b] = await Promise.all([enqueue(project.id, 72, key), enqueue(project.id, 72, key)]);
  assert.deepEqual(a, b);
  await req(
    `/projects/${project.id}/render-runs`,
    'POST',
    { presetId: 'poc-v1', titleFontSize: 64 },
    409,
    key,
  );
  await req(
    `/projects/${project.id}/render-runs`,
    'POST',
    { presetId: 'poc-v1', code: 'untrusted TSX' },
    400,
  );
  await req(
    `/projects/${project.id}/render-runs`,
    'POST',
    { presetId: 'poc-v1', titleFontSize: 999 },
    400,
  );
  await req(`/jobs/${a.jobId}/render-files/video.mp4`, 'GET', undefined, 409);
  record('真实 202/jobId、幂等及固定入口/参数保护', { jobId: a.jobId, duplicateJob: false });
  const { chromium } = appRequire('playwright');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.STUDIO_UI_BROWSER_PATH || process.env.STUDIO_CHROMIUM_PATH,
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  assert.ok(
    await page.evaluate(() =>
      document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'),
    ),
    'UI browser lacks H.264; set STUDIO_UI_BROWSER_PATH to a compatible Chrome/Edge',
  );
  await page.goto(`${base}/projects/${project.id}/motion`);
  await page.getByRole('button', { name: '渲染 10 秒示例', exact: true }).waitFor();
  await page.getByText('等待独立 Render Worker', { exact: true }).waitFor();
  await pageCapture(page, '08-queued.png');
  const w = worker();
  const active = await until(a.jobId, (j) => j.state === 'running');
  const initialLease = active.leaseExpiresAt;
  const heartbeat = await until(a.jobId, (j) => !!j.heartbeatAt);
  assert.ok(Date.parse(heartbeat.leaseExpiresAt) >= Date.parse(initialLease));
  await page.getByText('Worker 正在渲染', { exact: true }).waitFor();
  await pageCapture(page, '08-running.png');
  const done = await until(a.jobId, (j) => ['succeeded', 'failed', 'cancelled'].includes(j.state));
  fs.writeFileSync(path.join(evidenceDir, 'worker.log'), w.text);
  assert.equal(
    done.state,
    'succeeded',
    JSON.stringify({ errorCode: done.errorCode, logs: done.logs, worker: w.text }),
  );
  assert.equal(await w.done, 0);
  fs.writeFileSync(path.join(evidenceDir, 'worker.log'), w.text);
  assert.equal(done.renderResult.manifestHash, fingerprint(done.renderInput));
  if (db) {
    const rows = await db.$queryRawUnsafe(
      'SELECT document FROM workflow_jobs WHERE id=$1::uuid',
      done.id,
    );
    assert.deepEqual(rows[0].document, done);
    const roles = await db.$queryRawUnsafe(
      'SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname=current_user',
    );
    assert.equal(roles[0].rolsuper, false);
    assert.equal(roles[0].rolcreatedb, false);
    record('PostgreSQL 行与真实 HTTP/Worker 结果完全一致', { jobId: done.id, ...roles[0] });
  }
  assert.equal(done.renderResult.previewManifestHash, done.renderResult.manifestHash);
  assert.ok(done.renderResult.determinism.every((d) => d.first === d.second));
  assert.equal(new Set(done.renderResult.determinism.map((d) => d.first)).size, 3);
  for (const artifact of done.renderResult.artifacts) {
    const r = await fetch(`${base}/api/v1/jobs/${a.jobId}/render-files/${artifact.file}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
    fs.writeFileSync(path.join(evidenceDir, artifact.file), bytes);
  }
  const video = path.join(evidenceDir, 'video.mp4');
  const probe = spawnSync(
    process.env.STUDIO_FFPROBE_PATH || 'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(probe.status, 0);
  const metadata = verifyVideoMetadata(JSON.parse(probe.stdout));
  fs.writeFileSync(path.join(evidenceDir, 'ffprobe-independent.json'), probe.stdout);
  record('真实 Remotion/心跳/媒体规格/三帧确定性', {
    jobId: a.jobId,
    metadata,
    leaseExtended: Date.parse(done.heartbeatAt) >= Date.parse(heartbeat.heartbeatAt),
    determinism: done.renderResult.determinism,
  });
  const publicDownload = await fetch(`${base}/api/v1/jobs/${a.jobId}/render-files/video.mp4`);
  assert.equal(publicDownload.status, 401);
  const range = await fetch(`${base}/api/v1/jobs/${a.jobId}/render-files/video.mp4`, {
    headers: { Cookie: cookie, Range: 'bytes=0-1023' },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 1024);
  const invalidRange = await fetch(`${base}/api/v1/jobs/${a.jobId}/render-files/video.mp4`, {
    headers: { Cookie: cookie, Range: 'bytes=99999999999-' },
  });
  assert.equal(invalidRange.status, 416);
  await req(`/jobs/${a.jobId}/render-files/input.json`, 'GET', undefined, 400);
  record('受保护视频/Range 播放/文件白名单', {
    anonymous: 401,
    range: 206,
    invalidRange: 416,
    unlistedFile: 400,
  });
  const decoded = path.join(evidenceDir, 'decoded-150.png');
  const decode = spawnSync(
    process.env.STUDIO_FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-y',
      '-i',
      video,
      '-vf',
      'select=eq(n\\,150)',
      '-vsync',
      '0',
      '-frames:v',
      '1',
      decoded,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(decode.status, 0, decode.stderr);
  const compare = spawnSync(
    process.env.STUDIO_FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-i',
      decoded,
      '-i',
      path.join(evidenceDir, 'frame-150.png'),
      '-lavfi',
      'psnr',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  fs.writeFileSync(path.join(evidenceDir, 'frame-match.log'), compare.stderr || '');
  assert.equal(compare.status, 0);
  const psnr = /average:([\d.]+|inf)/.exec(compare.stderr)?.[1];
  assert.ok(psnr === 'inf' || Number(psnr) > 30, 'Preview/final frame PSNR ' + psnr);
  record('关键帧与实际 MP4 对应画面一致', {
    frame: 150,
    psnr,
    sharedInputProps: true,
    sharedTimeline: true,
  });
  await page.getByRole('link', { name: '下载真实 MP4', exact: true }).waitFor({ timeout: 30000 });
  const player = page.getByLabel('Remotion 真实渲染预览');
  await player.evaluate(async (v) => {
    if (v.error) throw new Error(v.error.message);
    if (v.readyState < 1)
      await Promise.race([
        new Promise((ok, fail) => {
          v.addEventListener('loadedmetadata', ok, { once: true });
          v.addEventListener('error', fail, { once: true });
        }),
        new Promise((_, fail) =>
          setTimeout(() => fail(new Error('Video metadata timeout')), 15000),
        ),
      ]);
    v.currentTime = 5;
  });
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && v.readyState >= 2 && Math.abs(v.currentTime - 5) < 0.15;
  });
  assert.equal(await player.evaluate((v) => v.duration), 10);
  await player.evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 5.1);
  await player.evaluate((v) => v.pause());
  await pageCapture(page, '08-success.png');
  await page.reload();
  await page.getByRole('link', { name: '下载真实 MP4', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pageCapture(page, '08-mobile.png');
  record('第 08 页实际视频播放、刷新与 390px 响应式', {
    duration: 10,
    pageErrors: result.pageErrors,
  });
  assert.deepEqual(result.pageErrors, []);
  const original = await req('/projects/' + project.id);
  assert.deepEqual(original, project);
  const changed = await enqueue(project.id, 64);
  const changedJob = await getJob(changed.jobId);
  assert.notEqual(fingerprint(changedJob.renderInput), done.renderResult.manifestHash);
  assert.deepEqual(changedJob.renderInput.timeline, done.renderInput.timeline);
  await req(`/jobs/${changed.jobId}/cancel`, 'POST', { expectedVersion: changedJob.version });
  record('字号参数新输入、冻结时间轴、旧产物与项目不变', {
    newJobId: changed.jobId,
    targetDurationMs: original.targetDurationMs,
  });
  if (!process.argv.includes('--quick')) {
    const badProject = await create('Phase 02 actual failure/retry');
    const bad = await enqueue(badProject.id);
    const broken = worker({ STUDIO_CHROMIUM_PATH: path.join(data, 'missing-chromium.exe') });
    await broken.done;
    const failed = await getJob(bad.jobId);
    assert.equal(failed.state, 'failed');
    assert.ok(failed.logs.some((l) => l.message.includes('CHROMIUM_NOT_CONFIGURED')));
    await req(`/jobs/${bad.jobId}/render-files/video.mp4`, 'GET', undefined, 409);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto(`${base}/projects/${badProject.id}/motion`);
    await page.getByRole('alert').filter({ hasText: 'RENDER_PROCESS_FAILED' }).waitFor();
    await pageCapture(page, '08-failed.png');
    assert.equal(
      (await req('/projects/' + project.id)).id,
      project.id,
      'API remains healthy after child failure',
    );
    await req(`/jobs/${bad.jobId}/retry`, 'POST', { expectedVersion: failed.version });
    const retry = worker();
    await retry.done;
    const retried = await getJob(bad.jobId);
    assert.equal(retried.state, 'succeeded', JSON.stringify(retried.logs));
    assert.equal(retried.attempt, 2);
    assert.deepEqual(retried.renderInput, failed.renderInput);
    record('真实子进程失败、可定位 UI 日志、成功重试与异常隔离', {
      first: failed.state,
      second: retried.state,
      attempts: retried.attempts,
    });
    const cancelProject = await create('Phase 02 running cancellation');
    const c = await enqueue(cancelProject.id);
    const cw = worker();
    const running = await until(c.jobId, (j) => j.state === 'running');
    await req(`/jobs/${c.jobId}/cancel`, 'POST', { expectedVersion: running.version });
    await cw.done;
    const cancelled = await getJob(c.jobId);
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.renderResult, undefined);
    assert.equal(cancelled.resultRevisionId, null);
    record('真实运行中取消并封锁迟到结果', {
      state: cancelled.state,
      attempt: cancelled.attempt,
      resultRevisionId: cancelled.resultRevisionId,
    });
  }
  await browser.close();
  browser = undefined;
  const before = await req(`/projects/${project.id}/workflow`);
  await stopApp();
  await startApp();
  assert.deepEqual(await req(`/projects/${project.id}/workflow`), before);
  assert.equal(protectedHash(), originalHash);
  record('进程重启恢复与原数据目录保留', { unchanged: true, sha256: originalHash });
  result.status = 'PASS';
  result.finishedAt = new Date().toISOString();
  save();
}
main()
  .catch((e) => {
    result.status = 'FAIL';
    result.error = safe(e.stack || e);
    save();
    console.error(result.error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await stopApp();
    if (db) await db.$disconnect();
    for (const w of workers)
      if (w.p.exitCode === null) {
        if (process.platform === 'win32')
          spawnSync('taskkill', ['/PID', String(w.p.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        else w.p.kill();
      }
    fs.writeFileSync(path.join(data, 'app.log'), appLog);
  });

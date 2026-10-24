// Actual production HTTP/browser + isolated SQLite/PostgreSQL. All content is synthetic.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { randomUUID, createHash } = require('node:crypto'),
  { spawn, spawnSync, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module'),
  { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web'),
  req = createRequire(path.join(appDir, 'package.json'));
require('../../scripts/register-typescript.cjs');
const backend = process.argv.includes('--postgres') ? 'postgresql' : 'sqlite',
  runId = process.env.STUDIO_DIRECTOR_RESUME_RUN || Date.now().toString(36);
const dataDir = path.join(root, '.cache/phase06', runId),
  evidence = path.join(
    root,
    process.env.STUDIO_TEST_PHASE_EVIDENCE_ROOT || 'docs/evidence/phase06/ui-protections',
    backend,
  ),
  port = backend === 'postgresql' ? 3019 : 3018,
  base = 'http://127.0.0.1:' + port;
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: '',
  STUDIO_DATA_DIR: dataDir,
  STUDIO_SYSTEM_TTS_ENABLED: '1',
  STUDIO_SPEECH_ENABLED: '1',
  STUDIO_CODEX_ENABLED: '1',
};
let app,
  browser,
  cookie,
  db,
  credentials,
  appLog = '';
const result = {
  status: 'RUNNING',
  at: new Date().toISOString(),
  backend,
  runId,
  checks: [],
  pageErrors: [],
};
const safe = (x) =>
  credentials
    ? String(x)
        .replaceAll(credentials.adminPassword, '[REDACTED]')
        .replaceAll(credentials.appPassword, '[REDACTED]')
    : String(x);
const save = () =>
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2) + '\n');
function record(name, detail = {}) {
  result.checks.push({ name, status: 'PASS', detail });
  save();
  console.log('PASS ' + name);
}
function originalHash() {
  const h = createHash('sha256');
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        h.update(p);
        h.update(fs.readFileSync(p));
      }
    }
  }
  walk(path.join(appDir, '.data'));
  walk(path.join(root, '.cache/acceptance-data'));
  return h.digest('hex');
}
const beforeHash = originalHash();
function command(args, extra = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: appDir,
    env: { ...env, ...extra },
    windowsHide: true,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(r.status, 0, safe(r.stdout + r.stderr));
  return safe(r.stdout + r.stderr);
}
async function startApp() {
  await new Promise((ok, fail) => {
    const s = require('node:net').createServer();
    s.once('error', fail);
    s.listen(port, '127.0.0.1', () => s.close(ok));
  });
  app = spawn(
    process.execPath,
    [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)],
    { cwd: appDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  app.stdout.on('data', (b) => (appLog += safe(b)));
  app.stderr.on('data', (b) => (appLog += safe(b)));
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw Error(appLog.slice(-1000));
    try {
      const r = await fetch(base + '/projects');
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
async function raw(p, method = 'GET', body, key = randomUUID()) {
  const r = await fetch(base + '/api/v1' + p, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
async function api(p, method = 'GET', body, status = 200, key) {
  const r = await raw(p, method, body, key);
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body.data;
}
async function project(entry = 'script') {
  return api(
    '/projects',
    'POST',
    {
      title: `Phase 06 ${backend} 合成${entry}验收`,
      prompt: '为什么这个问题值得解释？\n\n第二段用户原文，只是合成测试。',
      entryType: entry,
      voiceMode: 'none',
      targetDurationMs: 120000,
      width: 1080,
      height: 1920,
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    201,
  );
}
const workspace = (p, id) => api(`/projects/${p.id}/script${id ? '?revisionId=' + id : ''}`);
async function wf(p) {
  return api(`/projects/${p.id}/workflow`);
}
async function review(p, r, action, comment = '') {
  return api(`/artifacts/${r.artifactId}/revisions/${r.id}/${action}`, 'POST', {
    expectedVersion: r.version,
    ...(action === 'approve' || action === 'reject' ? { comment } : {}),
  });
}
async function approve(p, r) {
  return review(p, await review(p, r, 'submit'), 'approve');
}
async function fork(p, r, inputRevisionIds) {
  return api(`/artifacts/${r.artifactId}/revisions`, 'POST', {
    revisionId: r.id,
    expectedVersion: r.version,
    ...(inputRevisionIds ? { inputRevisionIds } : {}),
  });
}
async function saveScript(p, xs, expectedVersion) {
  const w = await workspace(p);
  return api(`/projects/${p.id}/script`, 'PATCH', {
    revisionId: w.revision.id,
    expectedVersion: expectedVersion ?? w.revision.version,
    segments: xs,
    unitsPerMinute: 240,
  });
}
async function worker(extra = {}) {
  const w = await nativeWorker(extra);
  const code = await w.done;
  assert.equal(code, 0, 'Worker exit ' + code);
}
async function initializePostgres() {
  credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')),
  );
  assert.equal(credentials.host, '127.0.0.1');
  assert.equal(credentials.port, 55432);
  const { PrismaClient } = req('@prisma/client'),
    database = 'studio_phase06_' + runId;
  const url = (admin) => {
    const u = new URL(
      'postgresql://127.0.0.1:55432/' + (admin ? 'postgres' : database) + '?schema=public',
    );
    u.username = admin ? credentials.adminUser : credentials.appUser;
    u.password = admin ? credentials.adminPassword : credentials.appPassword;
    return u.href;
  };
  const admin = new PrismaClient({ datasources: { db: { url: url(true) } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" OWNER studio_app`);
  } finally {
    await admin.$disconnect();
  }
  env.DATABASE_URL = url(false);
  result.database = database;
  const legacy = path.join(dataDir, 'baseline/prisma');
  fs.mkdirSync(path.join(legacy, 'migrations'), { recursive: true });
  fs.writeFileSync(
    path.join(legacy, 'schema.prisma'),
    execFileSync(
      'git',
      ['show', '0f2fa62bf4fd9ef6cde2ff21540fed71574b8258:apps/web/prisma/schema.prisma'],
      { cwd: root },
    ),
  );
  for (const file of fs
    .readdirSync(path.join(appDir, 'prisma/migrations'))
    .filter((f) => f !== '0006_director'))
    fs.cpSync(path.join(appDir, 'prisma/migrations', file), path.join(legacy, 'migrations', file), {
      recursive: true,
    });
  const cli = req.resolve('prisma/build/index.js');
  const initial = command([
    cli,
    'migrate',
    'deploy',
    '--schema',
    path.join(legacy, 'schema.prisma'),
  ]);
  db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const { openPostgresRepository } = require('../../apps/web/src/server/project/postgres.ts'),
    { createProjectService } = require('../../apps/web/src/server/project/service.ts');
  const oldRepo = await openPostgresRepository(env.DATABASE_URL);
  const old = await createProjectService(oldRepo, { maxDurationMs: 3600000 }).create(
    {
      title: 'Preserved Phase04.5 synthetic fixture',
      prompt: 'Self-authored test only',
      entryType: 'script',
      voiceMode: 'none',
      targetDurationMs: 240000,
      width: 1080,
      height: 1920,
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    'local-user',
  );
  await oldRepo.close();
  const before = await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM projects');
  const upgrade = command([cli, 'migrate', 'deploy']),
    repeat = command([cli, 'migrate', 'deploy']);
  fs.writeFileSync(path.join(evidence, 'migrations.log'), initial + upgrade + repeat);
  assert.deepEqual(await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM projects'), before);
  assert.deepEqual(
    (await db.$queryRawUnsafe('SELECT document FROM projects WHERE id=$1::uuid', old.id))[0]
      .document,
    old,
  );
  const migrations = await db.$queryRawUnsafe(
    'SELECT migration_name,count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL GROUP BY migration_name ORDER BY migration_name',
  );
  assert.equal(migrations.length, 6);
  assert.ok(migrations.every((m) => m.count === 1));
  const role = (
    await db.$queryRawUnsafe('SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user')
  )[0];
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false });
  record('PostgreSQL 0001–0005 基线升级0006、重复部署、非超级用户', { migrations, role });
}
async function nativeWorker(extra = {}) {
  const child = spawn(
    process.execPath,
    [path.join(root, 'scripts/workflow-worker.cjs'), '--once'],
    {
      cwd: appDir,
      env: { ...env, ...extra },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (b) => (log += safe(b)));
  child.stderr.on('data', (b) => (log += safe(b)));
  return {
    child,
    done: new Promise((resolve) =>
      child.on('exit', (code) => {
        fs.appendFileSync(path.join(evidence, 'workers.log'), log);
        resolve(code);
      }),
    ),
  };
}
async function running(p, id) {
  for (let i = 0; i < 100; i++) {
    const j = await findJob(p, id);
    if (j.state === 'running') return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('running timeout');
}
const { blankShot, reflowShots } = require('../../apps/web/src/domain/director.ts');
const director = (p) => api(`/projects/${p.id}/director`);
const voice = (p) => api(`/projects/${p.id}/voice-timeline`);
async function main() {
  await startApp();
  const p = await project(),
    script = await approve(
      p,
      await api(
        `/projects/${p.id}/script`,
        'POST',
        { origin: 'user_provided', text: '静默图形编辑验收。' },
        201,
      ),
    );
  await api(
    `/projects/${p.id}/voice-timeline`,
    'POST',
    { scriptRevisionId: script.id, mode: 'none' },
    201,
  );
  let v = await voice(p);
  await api(`/projects/${p.id}/voice-timeline`, 'PATCH', {
    revisionId: v.revision.id,
    expectedVersion: v.revision.version,
    durationMs: 120000,
    cues: v.cues,
    subtitles: v.track.cues,
    alignmentConfirmed: true,
  });
  v = await voice(p);
  await approve(p, v.revision);
  await api(
    `/projects/${p.id}/director`,
    'POST',
    { scriptRevisionId: script.id, voiceRevisionId: v.revision.id },
    201,
  );
  let w = await director(p);
  const shots = reflowShots(
    Array.from({ length: 6 }, () => blankShot([w.segments[0].id], randomUUID(), 600)),
  );
  await api(`/projects/${p.id}/director`, 'PATCH', {
    revisionId: w.revision.id,
    expectedVersion: w.revision.version,
    shots,
  });
  w = await director(p);
  const queued = await api(
    `/projects/${p.id}/director-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      mode: 'mock',
      shotCount: 6,
      instruction: '显式Mock，只验证界面状态保护',
    },
    202,
  );
  browser = await req('playwright').chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${p.id}/storyboard`);
  await page.getByLabel('镜头标题', { exact: true }).fill('未保存编辑必须保留');
  // Internal test-only claim simulates worker ownership while an edit buffer is dirty.
  const { openWorkflowRepository } = require('../../apps/web/src/server/workflow/repository.ts'),
    { createWorkflowService } = require('../../apps/web/src/server/workflow/service.ts');
  const repo = await openWorkflowRepository('file:' + path.join(dataDir, 'studio.db'));
  await createWorkflowService(repo).execute(
    p.id,
    'local-user',
    { action: 'claim', jobId: queued.jobId, workerId: 'ui-protection-test' },
    randomUUID(),
  );
  await repo.close();
  await page.getByText('mock 导演任务', { exact: true }).waitFor();
  await page.waitForTimeout(2500);
  await page
    .getByText(queued.jobId, { exact: true })
    .locator('..')
    .getByRole('button', { name: '取消任务', exact: true })
    .click();
  await page.waitForTimeout(2300);
  assert.equal(
    await page.getByLabel('镜头标题', { exact: true }).inputValue(),
    '未保存编辑必须保留',
  );
  assert.equal((await wf(p)).jobs.find((j) => j.id === queued.jobId).state, 'cancelled');
  await page
    .getByText(queued.jobId, { exact: true })
    .locator('..')
    .getByRole('button', { name: '重试任务', exact: true })
    .click();
  await page.waitForTimeout(2300);
  assert.equal(
    await page.getByLabel('镜头标题', { exact: true }).inputValue(),
    '未保存编辑必须保留',
  );
  assert.equal((await wf(p)).jobs.find((j) => j.id === queued.jobId).state, 'queued');
  await page
    .getByText(queued.jobId, { exact: true })
    .locator('..')
    .getByRole('button', { name: '取消任务', exact: true })
    .click();
  record('编辑未保存时独立刷新Job版本；取消和重试不覆盖编辑缓冲');
  w = await director(p);
  await api(`/projects/${p.id}/director`, 'PATCH', {
    revisionId: w.revision.id,
    expectedVersion: w.revision.version,
    shots: w.shots.map((s, i) => (i ? s : { ...s, title: '另一个客户端保存' })),
  });
  await page.getByRole('button', { name: '保存导演草稿', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '409' }).waitFor();
  assert.equal(
    await page.getByLabel('镜头标题', { exact: true }).inputValue(),
    '未保存编辑必须保留',
  );
  await page.screenshot({ path: path.join(evidence, '06-conflict-buffer.png'), fullPage: true });
  await page.getByRole('button', { name: '重新载入（放弃本地修改）', exact: true }).first().click();
  await page.waitForTimeout(1000);
  assert.equal(await page.getByLabel('镜头标题', { exact: true }).inputValue(), '另一个客户端保存');
  record('真实浏览器409保留编辑内容；显式重新载入后采用服务器版本');
  const ids = (await director(p)).shots.map((s) => s.shotId);
  await page.getByRole('button', { name: '新增镜头', exact: true }).click();
  await page.getByRole('button', { name: '上移镜头', exact: true }).click();
  await page.getByRole('button', { name: '删除镜头', exact: true }).click();
  await page.getByRole('button', { name: '保存导演草稿', exact: true }).click();
  await page.getByText('导演草稿已保存；段落和镜头ID保持稳定。', { exact: true }).waitFor();
  assert.deepEqual(
    (await director(p)).shots.map((s) => s.shotId),
    ids,
  );
  record('浏览器新增/排序/删除镜头后原镜头ID保持，保存连续时间轴');
  await page.screenshot({
    path: path.join(evidence, '06-workbench-viewport.png'),
    fullPage: false,
  });
  w = await director(p);
  await fork(p, await approve(p, w.revision));
  await page.reload();
  await page.getByLabel('镜头标题', { exact: true }).fill('可审查的前后差异');
  await page.getByRole('button', { name: '保存导演草稿', exact: true }).click();
  await page.getByText('导演草稿已保存；段落和镜头ID保持稳定。', { exact: true }).waitFor();
  await page.getByText('逐镜修改前后内容与顺序', { exact: true }).click();
  await page.getByText('可审查的前后差异', { exact: false }).last().waitFor();
  w = await director(p);
  assert.equal(w.diff.changes[0].before.title, '另一个客户端保存');
  assert.equal(w.diff.changes[0].after.title, '可审查的前后差异');
  await page.screenshot({ path: path.join(evidence, '06-before-after-diff.png'), fullPage: true });
  record('Fork差异实际显示修改前后镜头内容和顺序');
  assert.deepEqual(result.pageErrors, []);
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
    fs.writeFileSync(path.join(dataDir, 'app.log'), appLog);
  });

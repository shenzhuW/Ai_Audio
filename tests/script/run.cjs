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
  runId = Date.now().toString(36);
const dataDir = path.join(root, '.cache/phase04', runId),
  evidence = path.join(root, 'docs/evidence/phase04', backend),
  base = 'http://127.0.0.1:3010';
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const env = { ...process.env, DATABASE_URL: '', STUDIO_DATA_DIR: dataDir };
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
    s.listen(3010, '127.0.0.1', () => s.close(ok));
  });
  app = spawn(
    process.execPath,
    [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3010'],
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
      title: `Phase 04 ${backend} 合成${entry}验收`,
      prompt: '为什么这个问题值得解释？\n\n第二段用户原文，只是合成测试。',
      entryType: entry,
      voiceMode: 'none',
      targetDurationMs: 240000,
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
function worker(file = 'workflow-worker.cjs') {
  const log = command([path.join(root, 'scripts', file), '--once']);
  fs.appendFileSync(path.join(evidence, 'workers.log'), log);
  return log;
}
async function initializePostgres() {
  credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')),
  );
  assert.equal(credentials.host, '127.0.0.1');
  assert.equal(credentials.port, 55432);
  const { PrismaClient } = req('@prisma/client'),
    database = 'studio_phase04_' + runId;
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
    assert.match(database, /^studio_phase04_[a-z0-9]+$/);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" OWNER studio_app`);
  } finally {
    await admin.$disconnect();
  }
  env.DATABASE_URL = url(false);
  result.database = database;
  const legacy = path.join(dataDir, 'baseline', 'prisma');
  fs.mkdirSync(path.join(legacy, 'migrations'), { recursive: true });
  fs.writeFileSync(
    path.join(legacy, 'schema.prisma'),
    execFileSync(
      'git',
      ['show', '4fa1d4088fc89ba2292895066443c7aa3630bdb4:apps/web/prisma/schema.prisma'],
      { cwd: root },
    ),
  );
  fs.copyFileSync(
    path.join(appDir, 'prisma/migrations/migration_lock.toml'),
    path.join(legacy, 'migrations/migration_lock.toml'),
  );
  for (const name of ['0001_project', '0002_workflow', '0003_research']) {
    fs.mkdirSync(path.join(legacy, 'migrations', name));
    fs.copyFileSync(
      path.join(appDir, 'prisma/migrations', name, 'migration.sql'),
      path.join(legacy, 'migrations', name, 'migration.sql'),
    );
  }
  const cli = req.resolve('prisma/build/index.js'),
    initial = command([cli, 'migrate', 'deploy', '--schema', path.join(legacy, 'schema.prisma')]);
  const { openPostgresRepository } = require('../../apps/web/src/server/project/postgres.ts'),
    { createProjectService } = require('../../apps/web/src/server/project/service.ts');
  const oldRepo = await openPostgresRepository(env.DATABASE_URL),
    old = await createProjectService(oldRepo, { maxDurationMs: 3600000 }).create(
      {
        title: 'Preserved pre-Phase04 fixture',
        prompt: 'Synthetic baseline',
        entryType: 'topic',
        voiceMode: 'none',
        targetDurationMs: 240000,
        width: 1080,
        height: 1920,
        budgetLimit: { currency: 'CNY', amount: 50 },
      },
      'local-user',
    );
  await oldRepo.close();
  const upgrade = command([cli, 'migrate', 'deploy']),
    repeat = command([cli, 'migrate', 'deploy']);
  fs.writeFileSync(path.join(evidence, 'migrations.log'), initial + upgrade + repeat);
  db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  assert.deepEqual(
    (await db.$queryRawUnsafe('SELECT document FROM projects WHERE id=$1::uuid', old.id))[0]
      .document,
    old,
  );
  const migrations = await db.$queryRawUnsafe(
    'SELECT migration_name,count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL GROUP BY migration_name ORDER BY migration_name',
  );
  assert.equal(migrations.length, 4);
  assert.ok(migrations.every((x) => x.count === 1));
  const role = (
    await db.$queryRawUnsafe('SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user')
  )[0];
  assert.equal(role.rolsuper, false);
  assert.equal(role.rolcreatedb, false);
  record('真实 PostgreSQL：Phase03 基线升级0004、重复部署与旧项目保留', { migrations, role });
}
async function source(p, research, title, text) {
  const w = await api(`/projects/${p.id}/research`),
    form = new FormData();
  form.set('file', new Blob([text], { type: 'text/plain' }), title + '.txt');
  form.set(
    'metadata',
    JSON.stringify({
      revisionId: research.id,
      expectedVersion: w.revision.version,
      title,
      publisher: 'Self-authored synthetic fixture',
      knownRestrictions: '内部合成验收；非真实研究事实',
      licenseStatus: 'blocked',
    }),
  );
  const r = await fetch(base + `/api/v1/projects/${p.id}/research-sources`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Idempotency-Key': randomUUID() },
    body: form,
  });
  const b = await r.json();
  assert.equal(r.status, 201, JSON.stringify(b));
  return b.data;
}
async function researchEdit(p, section, body) {
  const w = await api(`/projects/${p.id}/research`);
  return api(
    `/projects/${p.id}/${section}`,
    'POST',
    { revisionId: w.revision.id, expectedVersion: w.revision.version, ...body },
    section === 'claims' || section === 'research-evidence' ? 201 : 202,
  );
}
async function capture(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, name), fullPage: true });
}
async function main() {
  if (backend === 'postgresql') await initializePostgres();
  await startApp();
  fs.writeFileSync(
    path.join(evidence, 'http.log'),
    command([path.join(root, 'tests/http/run.mjs')], {
      STUDIO_TEST_URL: base,
      STUDIO_TEST_BACKEND: backend,
      STUDIO_TEST_EVIDENCE_DIR: evidence,
    }),
  );
  const { workflowAcceptance } = await import(
    pathToFileURL(path.join(root, 'tests/workflow/http.mjs'))
  );
  await workflowAcceptance(base, backend, evidence);
  record('Phase00/01 HTTP 与工作流回归', { http: 15, workflow: 8 });
  const p = await project();
  result.userProjectId = p.id;
  assert.equal((await workspace(p)).revision, null);
  let r = await api(
    `/projects/${p.id}/script`,
    'POST',
    { origin: 'user_provided', text: p.input.prompt },
    201,
  );
  let w = await workspace(p);
  assert.equal(w.document.researchRevisionId, null);
  assert.equal(w.segments.length, 2);
  const ids = w.segments.map((s) => s.id);
  w.segments[1].text = 'API 保存的第二段。';
  w.segments[1].viewerTakeaway = '观众理解因果与证据边界';
  w.segments[1].visualIntent = '对照来源与逻辑关系，可覆盖多个镜头';
  w.segments[1].pauseMs = 500;
  await saveScript(p, w.segments);
  assert.equal((await workspace(p)).segments[1].text, 'API 保存的第二段。');
  assert.equal((await workspace(p)).segments[1].viewerTakeaway, '观众理解因果与证据边界');
  assert.equal((await workspace(p)).segments[1].visualIntent, '对照来源与逻辑关系，可覆盖多个镜头');
  w = await workspace(p);
  const body = {
    revisionId: w.revision.id,
    expectedVersion: w.revision.version,
    unitsPerMinute: 240,
    segments: w.segments,
  };
  const conflicts = await Promise.all([
    raw(`/projects/${p.id}/script`, 'PATCH', body),
    raw(`/projects/${p.id}/script`, 'PATCH', { ...body, unitsPerMinute: 260 }),
  ]);
  assert.deepEqual(conflicts.map((x) => x.status).sort(), [200, 409]);
  w = await workspace(p);
  const key = randomUUID(),
    idem = {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      segments: w.segments,
      unitsPerMinute: 240,
    };
  const first = await api(`/projects/${p.id}/script`, 'PATCH', idem, 200, key);
  assert.deepEqual(await api(`/projects/${p.id}/script`, 'PATCH', idem, 200, key), first);
  record('用户文稿跳过研究、稳定段落ID、真实并发409与幂等', {
    segmentIds: ids,
    statuses: [200, 409],
  });
  browser = await req('playwright').chromium.launch({
    headless: true,
    executablePath: process.env.STUDIO_UI_BROWSER_PATH || process.env.STUDIO_CHROMIUM_PATH,
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1150 } });
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${p.id}/script`);
  await page.getByRole('spinbutton', { name: '朗读单位每分钟', exact: true }).fill('0');
  await page
    .getByText('请输入 60–600 之间的朗读单位；当前暂按 240 估算，不能保存无效设置。', {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: '保存段落草稿', exact: true }).isDisabled(),
    true,
    'Invalid narration rate must not allow save or show Infinity',
  );
  await page.getByRole('spinbutton', { name: '朗读单位每分钟', exact: true }).fill('240');
  await page
    .getByRole('textbox', { name: '第2段正文', exact: true })
    .fill('浏览器编辑第二段，刷新后应保留。');
  await page.getByRole('button', { name: '保存段落草稿', exact: true }).click();
  await page.getByText('段落草稿已保存', { exact: true }).waitFor();
  await page.reload();
  assert.equal(
    await page.getByRole('textbox', { name: '第2段正文', exact: true }).inputValue(),
    '浏览器编辑第二段，刷新后应保留。',
  );
  await page.getByRole('button', { name: '添加段落', exact: true }).click();
  await page.getByRole('textbox', { name: '第3段正文', exact: true }).fill('浏览器新增段落。');
  await page.getByRole('button', { name: '上移第3段', exact: true }).click();
  await page.getByRole('button', { name: '保存段落草稿', exact: true }).click();
  await page.getByText('段落草稿已保存', { exact: true }).waitFor();
  w = await workspace(p);
  assert.equal(w.segments[0].id, ids[0]);
  assert.equal(w.segments[2].id, ids[1]);
  assert.equal(w.segments[1].text, '浏览器新增段落。');
  await page.getByRole('button', { name: '删除第2段', exact: true }).click();
  await page.getByRole('button', { name: '保存段落草稿', exact: true }).click();
  await page.getByText('段落草稿已保存', { exact: true }).waitFor();
  w = await workspace(p);
  assert.deepEqual(
    w.segments.map((s) => s.id),
    ids,
  );
  await capture(page, '04-user-script.png');
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByRole('button', { name: '批准当前修订', exact: true }).click();
  await page
    .getByText('当前文稿快照只读。修改已提交、已批准或已驳回内容，请创建新修订。', { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '第2段正文', exact: true }).getAttribute('readonly'),
    '',
  );
  await capture(page, '04-approved.png');
  const approved = (await workspace(p)).revision,
    oldSnapshot = await workspace(p, approved.id);
  await api(
    `/projects/${p.id}/script`,
    'PATCH',
    {
      revisionId: approved.id,
      expectedVersion: approved.version,
      segments: w.segments,
      unitsPerMinute: 240,
    },
    422,
  );
  for (const table of ['script_documents', 'script_segment_versions']) {
    if (db)
      await assert.rejects(
        db.$executeRawUnsafe(
          `UPDATE ${table} SET document=document WHERE revision_id=$1::uuid`,
          approved.id,
        ),
      );
    else {
      const { DatabaseSync } = require('node:sqlite');
      const sqlite = new DatabaseSync(path.join(dataDir, 'studio.db'));
      try {
        assert.throws(() =>
          sqlite
            .prepare(`UPDATE ${table} SET document=document WHERE revision_id=?`)
            .run(approved.id),
        );
      } finally {
        sqlite.close();
      }
    }
  }
  await page.getByRole('button', { name: '创建新修订', exact: true }).click();
  await page.getByText(/文稿快照 v2 · 草稿/).waitFor();
  await page.getByRole('textbox', { name: '第2段正文', exact: true }).fill('新版本第二段的解释。');
  await page.getByRole('button', { name: '保存段落草稿', exact: true }).click();
  await page.getByText('段落草稿已保存', { exact: true }).waitFor();
  w = await workspace(p);
  assert.equal(w.diff.find((d) => d.segmentId === ids[1]).changes.includes('text'), true);
  assert.deepEqual(
    w.segments.map((s) => s.id),
    ids,
  );
  await capture(page, '04-diff.png');
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByLabel('审核意见', { exact: true }).fill('合成验收：补充解释后再批准。');
  await page.getByRole('button', { name: '驳回修改', exact: true }).click();
  await page.getByText('修订已驳回，请创建新修订继续修改', { exact: true }).waitFor();
  await capture(page, '04-rejected.png');
  await page.getByRole('button', { name: '创建新修订', exact: true }).click();
  await page.getByText(/文稿快照 v3 · 草稿/).waitFor();
  await page.getByRole('button', { name: /^v1 · 已批准/ }).click();
  await page.getByText(/文稿快照 v1 · 已批准/).waitFor();
  await capture(page, '04-history.png');
  assert.deepEqual((await workspace(p, approved.id)).segments, oldSnapshot.segments);
  record('真实浏览器第二段刷新、段落增删排序、批准/驳回/Fork/历史/差异与双表保护', {
    stableSegmentIds: ids,
    approvedRevisionId: approved.id,
  });
  // Declared per-segment consumers demonstrate dependency computation, not real Phase05/06 outputs.
  const consumer1 = await api(
    `/projects/${p.id}/artifacts`,
    'POST',
    {
      type: 'voice',
      text: 'Synthetic dependency record for second segment, no audio',
      inputRevisionIds: [approved.id],
      inputSegmentIds: [ids[1]],
    },
    201,
  );
  await approve(p, consumer1);
  const consumer2 = await api(
    `/projects/${p.id}/artifacts`,
    'POST',
    {
      type: 'storyboard',
      text: 'Synthetic dependency record for first segment, no shots',
      inputRevisionIds: [approved.id],
      inputSegmentIds: [ids[0]],
    },
    201,
  );
  await approve(p, consumer2);
  const current = (await workspace(p)).revision;
  await approve(p, current);
  const dependencies = await wf(p);
  assert.ok(dependencies.staleRevisionIds.includes(consumer1.id));
  assert.ok(!dependencies.staleRevisionIds.includes(consumer2.id));
  const workspaceImpact = (await workspace(p)).impact.downstream;
  assert.ok(workspaceImpact.some((x) => x.revisionId === consumer1.id && x.stale));
  assert.ok(workspaceImpact.some((x) => x.revisionId === consumer2.id && !x.stale));
  await page.goto(base + `/projects/${p.id}/script`);
  await page.getByText(/文稿 v1 · 依赖失效/).waitFor();
  await capture(page, '04-downstream-impact.png');
  record('修改指定段落后依赖失效、未改段落依赖仍可复用', {
    changed: consumer1.id,
    unchanged: consumer2.id,
    syntheticConsumers: true,
  });
  const q = await project('topic');
  result.researchProjectId = q.id;
  let research = await api(
    `/projects/${q.id}/artifacts`,
    'POST',
    {
      type: 'research',
      text: '合成研究摘要：两份资料相互冲突，不是现实事实。',
      inputRevisionIds: [],
    },
    201,
  );
  const a = await source(q, research, '合成来源A', 'SYNTHETIC TEST ONLY. Capacity is 32 units.'),
    b = await source(q, research, '合成来源B', 'SYNTHETIC TEST ONLY. Capacity is 64 units.');
  await researchEdit(q, 'research-analysis-runs', { sourceId: a.id, mode: 'real' });
  await researchEdit(q, 'research-analysis-runs', { sourceId: b.id, mode: 'real' });
  worker('research-worker.cjs');
  const c = await researchEdit(q, 'claims', {
    claim: {
      text: '合成测试容量为32单位，资料存在冲突',
      asOf: '2026-10-23',
      scope: '仅自制合成夹具',
      unit: 'units',
      caveats: '不构成现实测量或核验',
      verificationStatus: 'unverified',
    },
  });
  await researchEdit(q, 'research-evidence', {
    claimId: c.id,
    sourceId: a.id,
    role: 'support',
    quote: 'Capacity is 32 units.',
    locator: { kind: 'text', label: '合成资料A第1段' },
  });
  await researchEdit(q, 'research-evidence', {
    claimId: c.id,
    sourceId: b.id,
    role: 'refute',
    quote: 'Capacity is 64 units.',
    locator: { kind: 'text', label: '合成资料B第1段' },
  });
  let researchW = await api(`/projects/${q.id}/research`);
  research = await approve(q, researchW.revision);
  r = await api(
    `/projects/${q.id}/script`,
    'POST',
    {
      origin: 'research',
      researchRevisionId: research.id,
      text: '为什么两份资料不一致？\n\n这些数值来自合成验收，不能当作现实结论。',
    },
    201,
  );
  w = await workspace(q);
  w.segments[1].factBindings = [{ claimId: c.id, sourceIds: [a.id, b.id] }];
  await saveScript(q, w.segments);
  w = await workspace(q);
  assert.ok(
    w.warnings.find((x) => x.segmentId === w.segments[1].id).notes.some((x) => x.includes('冲突')),
  );
  const invalid = structuredClone(w.segments);
  invalid[1].factBindings = [{ claimId: randomUUID(), sourceIds: [a.id] }];
  await api(
    `/projects/${q.id}/script`,
    'PATCH',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      segments: invalid,
      unitsPerMinute: 240,
    },
    422,
  );
  await page.goto(base + `/projects/${q.id}/script`);
  await page.getByRole('button', { name: '段落 2 · 总结', exact: true }).click();
  await page.getByText('查看 Claim 来源与引用位置', { exact: true }).click();
  await capture(page, '04-claims-conflict.png');
  record('文稿固定批准研究、双来源引用一致、冲突和未核实提示', {
    researchRevisionId: research.id,
    claimId: c.id,
    sourceIds: [a.id, b.id],
    invalidReference: 422,
  });
  const firstText = w.segments[0].text,
    secondId = w.segments[1].id;
  const job = await api(
    `/projects/${q.id}/script-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      segmentId: secondId,
      instruction: '让解释更清楚，不添加事实',
      mode: 'mock',
    },
    202,
  );
  worker();
  let j = await api(`/jobs/${job.jobId}`);
  assert.equal(j.state, 'succeeded');
  assert.equal(j.scriptResult.mode, 'mock');
  w = await workspace(q);
  assert.equal(w.segments[0].text, firstText);
  assert.equal(w.segments[1].id, secondId);
  assert.deepEqual(w.segments[1].factBindings, [{ claimId: c.id, sourceIds: [a.id, b.id] }]);
  const whole = await api(
    `/projects/${q.id}/script-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      instruction: '整体结构演示',
      mode: 'mock',
    },
    202,
  );
  worker();
  assert.equal((await api(`/jobs/${whole.jobId}`)).state, 'succeeded');
  w = await workspace(q);
  const unconfigured = await api(
    `/projects/${q.id}/script-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      instruction: '尝试真实写稿，未配置不得生成',
      mode: 'unconfigured',
    },
    202,
  );
  worker();
  j = await api(`/jobs/${unconfigured.jobId}`);
  assert.equal(j.errorCode, 'PROVIDER_NOT_CONFIGURED');
  assert.deepEqual((await workspace(q)).segments, w.segments);
  await page.reload();
  await page
    .getByText(/Mock · 未调用真实模型/)
    .first()
    .waitFor();
  await page.getByText(/查看 \d+ 项文稿任务/).click();
  await capture(page, '04-mock-unconfigured.png');
  record('整体/局部写稿 Adapter、真实Worker Mock标识及未配置失败', {
    partialJob: job.jobId,
    wholeJob: whole.jobId,
    unconfigured: unconfigured.jobId,
    partialPreservedOtherSegment: true,
  });
  w = await workspace(q);
  const scriptApproved = await approve(q, w.revision),
    snapshot = await workspace(q, scriptApproved.id);
  const newResearch = await fork(q, research);
  researchW = await api(`/projects/${q.id}/research`);
  const newClaim = researchW.claims[0];
  await api(`/projects/${q.id}/claims/${newClaim.id}`, 'PATCH', {
    revisionId: newResearch.id,
    expectedVersion: researchW.revision.version,
    claim: {
      text: '新版合成测试的描述已修改',
      asOf: newClaim.asOf,
      scope: newClaim.scope,
      unit: newClaim.unit,
      caveats: newClaim.caveats,
      verificationStatus: newClaim.verificationStatus,
    },
  });
  researchW = await api(`/projects/${q.id}/research`);
  const researchApproved2 = await approve(q, researchW.revision);
  w = await workspace(q);
  assert.equal(w.impact.stale, true);
  assert.deepEqual(w.impact.researchAffectedSegmentIds, [secondId]);
  await page.reload();
  await page.getByText(/上游研究已更新/).waitFor();
  await capture(page, '04-research-impact.png');
  await fork(q, scriptApproved, [researchApproved2.id]);
  w = await workspace(q);
  assert.deepEqual(
    w.segments.map((s) => s.id),
    snapshot.segments.map((s) => s.id),
  );
  assert.equal(w.segments[1].needsRebind, true);
  assert.deepEqual(w.segments[1].factBindings, []);
  const oldBinding = structuredClone(w.segments);
  oldBinding[1].factBindings = snapshot.segments[1].factBindings;
  await api(
    `/projects/${q.id}/script`,
    'PATCH',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      segments: oldBinding,
      unitsPerMinute: 240,
    },
    422,
  );
  w.segments[1].factBindings = [
    { claimId: newClaim.id, sourceIds: researchW.sources.map((s) => s.id) },
  ];
  w.segments[1].needsRebind = false;
  await saveScript(q, w.segments);
  assert.deepEqual((await workspace(q, scriptApproved.id)).segments, snapshot.segments);
  record('研究替换定位绑定段落、旧批准文稿保留、Fork清空旧Claim并显式重绑', {
    oldResearch: research.id,
    newResearch: researchApproved2.id,
    affectedSegmentIds: [secondId],
    oldIdsRejected: 422,
  });
  // Legacy Phase01 documents remain readable and can convert only in draft.
  const legacyProject = await project(),
    legacy = await api(
      `/projects/${legacyProject.id}/artifacts`,
      'POST',
      { type: 'script', text: 'Legacy first.\n\nLegacy second.', inputRevisionIds: [] },
      201,
    );
  await page.goto(base + `/projects/${legacyProject.id}/script`);
  await page.getByRole('button', { name: '转换当前草稿为结构化文稿', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '产物文本', exact: true }).getAttribute('readonly'),
    '',
  );
  await page.getByRole('button', { name: '转换当前草稿为结构化文稿', exact: true }).click();
  await page.getByRole('textbox', { name: '第2段正文', exact: true }).waitFor();
  assert.equal((await workspace(legacyProject)).revision.id, legacy.id);
  assert.equal((await workspace(legacyProject)).segments.length, 2);
  record('Phase01旧文本草稿可无损转换，不重新初始化项目');
  await page.goto(base + `/projects/${q.id}/script`);
  await page.getByRole('textbox', { name: '第2段正文', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 1000 });
  await capture(page, '04-mobile.png');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(result.pageErrors, []);
  await browser.close();
  browser = undefined;
  fs.writeFileSync(
    path.join(evidence, 'script-snapshot.json'),
    JSON.stringify(await workspace(q), null, 2),
  );
  const persisted = await workspace(q);
  await stopApp();
  await startApp();
  assert.deepEqual(await workspace(q), persisted);
  assert.equal(originalHash(), beforeHash);
  record('应用重启持久化、浏览器无错误及原数据保留', {
    originalDataHash: beforeHash,
    unchanged: true,
    pageErrors: [],
  });
  if (db) {
    const schema = path.join(appDir, 'prisma/schema.prisma');
    fs.writeFileSync(
      path.join(evidence, 'schema-drift.log'),
      command([
        req.resolve('prisma/build/index.js'),
        'migrate',
        'diff',
        '--from-schema-datasource',
        schema,
        '--to-schema-datamodel',
        schema,
        '--exit-code',
        '--script',
      ]),
    );
    record('PostgreSQL Schema零漂移');
  }
  result.status = 'PASS';
  result.finishedAt = new Date().toISOString();
  save();
}
main()
  .catch(async (e) => {
    if (browser)
      try {
        const p = browser.contexts()[0]?.pages()[0];
        if (p) {
          await p.screenshot({ path: path.join(dataDir, 'failure.png'), fullPage: true });
          fs.writeFileSync(
            path.join(dataDir, 'failure-aria.txt'),
            await p.locator('body').ariaSnapshot(),
          );
        }
      } catch {}
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
    fs.writeFileSync(path.join(dataDir, 'app.log'), appLog);
  });

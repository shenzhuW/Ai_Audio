// Actual production HTTP + isolated database + real Research Worker/Chrome/FFprobe.
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
const data = path.join(root, '.cache/phase03', runId);
const evidenceDir = path.resolve(
  root,
  process.env.STUDIO_TEST_PHASE_EVIDENCE_ROOT || 'docs/evidence/phase03',
  backend,
);
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
const base = 'http://127.0.0.1:3008';
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
    s.listen(3008, '127.0.0.1', () => s.close(ok));
  });
  app = spawn(
    process.execPath,
    [
      appRequire.resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3008',
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
  const p = spawn(process.execPath, [path.join(root, 'scripts/research-worker.cjs'), '--once'], {
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true });
  if (name === '03-video-index.png')
    await page.screenshot({
      path: path.join(evidenceDir, '03-overview-viewport.png'),
      fullPage: false,
    });
}

const { fixtures } = require('./fixtures.cjs');
const inputs = fixtures(path.join(data, 'self-authored-fixtures'));
let project;
const workspace = (id) => req(`/projects/${project.id}/research${id ? '?revisionId=' + id : ''}`);
const current = async () => (await workspace()).revision;
const edit = async () => {
  const r = await current();
  return { revisionId: r.id, expectedVersion: r.version };
};
async function upload(file, title, options = {}) {
  const metadata = {
    ...(await edit()),
    title,
    licenseStatus: 'blocked',
    knownRestrictions: '验收自制合成资料；仅内部测试',
    publisher: 'Self-authored synthetic test',
    creator: 'Test fixture',
    ...options,
  };
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  const key = randomUUID();
  const post = async () => {
    const r = await fetch(base + `/api/v1/projects/${project.id}/research-sources`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: base, 'Idempotency-Key': key },
      body: form,
    });
    const b = await r.json();
    assert.equal(r.status, 201, JSON.stringify(b));
    return b.data;
  };
  const source = await post();
  assert.deepEqual(await post(), source, 'upload retry must not duplicate source/blob');
  return source;
}
async function analyze(source, mode = 'real', key = randomUUID()) {
  return req(
    `/projects/${project.id}/research-analysis-runs`,
    'POST',
    { ...(await edit()), sourceId: source.id, mode },
    202,
    key,
  );
}
async function initializePostgres() {
  credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')),
  );
  assert.equal(credentials.host, '127.0.0.1');
  assert.equal(credentials.port, 55432);
  const { PrismaClient } = appRequire('@prisma/client'),
    database = 'studio_phase03_' + runId;
  const url = (admin) =>
    `postgresql://${admin ? credentials.adminUser : credentials.appUser}:${admin ? credentials.adminPassword : credentials.appPassword}@127.0.0.1:55432/${admin ? 'postgres' : database}?schema=public`;
  const admin = new PrismaClient({ datasources: { db: { url: url(true) } } });
  try {
    assert.match(database, /^studio_phase03_[a-z0-9]+$/);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" OWNER studio_app`);
  } finally {
    await admin.$disconnect();
  }
  env.DATABASE_URL = url(false);
  result.database = database;
  // Initialize the accepted Phase 02 schema, insert a real legacy project, then upgrade additively.
  const legacy = path.join(data, 'legacy', 'prisma');
  fs.mkdirSync(path.join(legacy, 'migrations'), { recursive: true });
  fs.writeFileSync(
    path.join(legacy, 'schema.prisma'),
    spawnSync(
      'git',
      ['show', '8e747526bba86b508e4916107b6aebcf2eef337a:apps/web/prisma/schema.prisma'],
      { cwd: root },
    ).stdout,
  );
  fs.copyFileSync(
    path.join(appDir, 'prisma/migrations/migration_lock.toml'),
    path.join(legacy, 'migrations/migration_lock.toml'),
  );
  for (const name of ['0001_project', '0002_workflow']) {
    fs.mkdirSync(path.join(legacy, 'migrations', name));
    fs.copyFileSync(
      path.join(appDir, 'prisma/migrations', name, 'migration.sql'),
      path.join(legacy, 'migrations', name, 'migration.sql'),
    );
  }
  const cli = appRequire.resolve('prisma/build/index.js');
  const initialLog = command([
    cli,
    'migrate',
    'deploy',
    '--schema',
    path.join(legacy, 'schema.prisma'),
  ]);
  const { openPostgresRepository } = require('../../apps/web/src/server/project/postgres.ts');
  const { createProjectService } = require('../../apps/web/src/server/project/service.ts');
  const legacyRepo = await openPostgresRepository(env.DATABASE_URL);
  const old = await createProjectService(legacyRepo, { maxDurationMs: 3600000 }).create(
    {
      title: 'Legacy Phase 02 project preserved',
      prompt: 'Synthetic legacy fixture',
      targetDurationMs: 240000,
      width: 1080,
      height: 1920,
      entryType: 'topic',
      voiceMode: 'none',
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    'local-user',
  );
  await legacyRepo.close();
  const upgradeLog = command([cli, 'migrate', 'deploy']),
    repeatLog = command([cli, 'migrate', 'deploy']);
  fs.writeFileSync(path.join(evidenceDir, 'migrations.log'), initialLog + upgradeLog + repeatLog);
  db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const rows = await db.$queryRawUnsafe('SELECT document FROM projects WHERE id=$1::uuid', old.id);
  assert.deepEqual(rows[0].document, old);
  const migrationRows = await db.$queryRawUnsafe(
    'SELECT migration_name, count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL GROUP BY migration_name ORDER BY migration_name',
  );
  assert.equal(
    migrationRows.length,
    fs
      .readdirSync(path.join(appDir, 'prisma/migrations'), { withFileTypes: true })
      .filter((x) => x.isDirectory()).length,
  );
  assert.ok(migrationRows.every((r) => r.count === 1));
  const roles = await db.$queryRawUnsafe(
    'SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user',
  );
  assert.deepEqual(roles, [{ rolsuper: false, rolcreatedb: false }]);
  const version = await db.$queryRawUnsafe('SELECT version() AS version');
  record('真实 PostgreSQL：旧两迁移初始化、项目保留、0003 升级与重复部署', {
    ...version[0],
    migrationRows,
    legacyProjectUnchanged: true,
    roles: roles[0],
  });
}
async function main() {
  if (postgres) await initializePostgres();
  await startApp();
  fs.writeFileSync(
    path.join(evidenceDir, 'legacy-http.log'),
    command([path.join(root, 'tests/http/run.mjs')], {
      STUDIO_TEST_URL: base,
      STUDIO_TEST_BACKEND: backend,
      STUDIO_TEST_EVIDENCE_DIR: evidenceDir,
    }),
  );
  record('原 HTTP CRUD、上传和十路由回归', { checks: 15 });
  const { workflowAcceptance } = await import(
    pathToFileURL(path.join(root, 'tests/workflow/http.mjs'))
  );
  await workflowAcceptance(base, backend, evidenceDir);
  record('Phase 01 原工作流回归', { checks: 8 });
  project = await create('Phase 03 ' + backend + ' 合成资料验收');
  result.projectId = project.id;
  assert.equal((await workspace()).revision, null);
  const first = await req(
    `/projects/${project.id}/artifacts`,
    'POST',
    {
      type: 'research',
      text: '仅用于验收的自制合成资料。所有数值不构成真实世界的事实或核验结论。',
      inputRevisionIds: [],
    },
    201,
  );
  const a = await upload(inputs.pdf, '合成 PDF 资料 A', {
      sourceUrl: 'https://example.invalid/user-supplied-not-fetched',
    }),
    b = await upload(inputs.text, '合成文本资料 B'),
    image = await upload(inputs.image, '自制图像资料'),
    videoSource = await upload(inputs.video, '自制十秒测试视频'),
    mockSource = await upload(inputs.image, 'Mock 视觉演示原件'),
    broken = await upload(inputs.broken, '损坏 PDF 测试');
  record('PDF/图片/视频/文本真实上传、幂等、来源限制保存', {
    sources: (await workspace()).sources.length,
    noncommercialAllowed: a.licenseStatus === 'blocked',
    unfetchedUrlNotConfirmed: a.urlStatus,
  });
  const jobs = [];
  for (const source of [a, b, image, videoSource, broken])
    jobs.push({ source: source.id, run: await analyze(source) });
  const mock = await analyze(mockSource, 'mock');
  const search = await req(
    `/projects/${project.id}/research-search-runs`,
    'POST',
    { ...(await edit()), query: '明确的合成检索演示', mode: 'mock' },
    202,
  );
  const unavailable = await req(
    `/projects/${project.id}/research-search-runs`,
    'POST',
    { ...(await edit()), query: '不应伪造任何文章', mode: 'unconfigured' },
    202,
  );
  const w = worker();
  assert.equal(await w.done, 0);
  fs.writeFileSync(path.join(evidenceDir, 'research-worker.log'), w.text);
  const researchData = await workspace();
  for (const item of jobs) {
    const j = await getJob(item.run.jobId);
    assert.equal(j.state, item.source === broken.id ? 'failed' : 'succeeded', JSON.stringify(j));
    if (item.source === broken.id) assert.equal(j.errorCode, 'PDF_PARSE_FAILED');
  }
  assert.equal((await getJob(mock.jobId)).state, 'succeeded');
  assert.equal((await getJob(unavailable.jobId)).errorCode, 'PROVIDER_NOT_CONFIGURED');
  const searchJob = await getJob(search.jobId);
  assert.deepEqual(searchJob.researchResult.candidates, []);
  assert.equal(searchJob.researchResult.mode, 'mock');
  assert.equal(researchData.sources.find((s) => s.id === a.id).metadata.pages, 1);
  assert.equal(researchData.sources.find((s) => s.id === image.id).metadata.width, 640);
  const segments = researchData.indexes.filter((x) => x.sourceId === videoSource.id);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].startMs, 0);
  assert.equal(segments.at(-1).endMs, 10000);
  assert.ok(
    segments.every(
      (x, i) =>
        x.provenance === 'real' &&
        x.frameRefs.length === 1 &&
        (i === 0 || x.startMs === segments[i - 1].endMs),
    ),
  );
  assert.ok(
    researchData.indexes.find((x) => x.sourceId === a.id).extractedText.includes('32 units'),
  );
  assert.ok(
    researchData.indexes
      .filter((x) => x.sourceId === mockSource.id)
      .every((x) => x.provenance === 'mock' && !x.extractedText),
  );
  assert.ok(
    researchData.jobs
      .filter((j) => j.researchInput && j.state === 'succeeded')
      .every((j) => j.heartbeatAt && j.logs.length),
  );
  for (const frame of segments.flatMap((s) => s.frameRefs)) {
    const r = await fetch(base + `/api/v1/sources/${videoSource.id}/files/${frame.blob.id}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.blob.sha256);
    fs.writeFileSync(path.join(evidenceDir, `frame-${frame.timeMs}.jpg`), bytes);
  }
  const mp4Blobs = fs.readdirSync(path.join(data, 'research-blobs')).filter(
    (name) =>
      fs
        .readFileSync(path.join(data, 'research-blobs', name))
        .subarray(4, 8)
        .toString() === 'ftyp',
  );
  assert.deepEqual(
    mp4Blobs.sort(),
    researchData.sources
      .filter((s) => s.blob.mime === 'video/mp4')
      .map((s) => s.blob.id)
      .sort(),
    'Only uploaded MP4 originals exist; no materialized clips',
  );
  record('真实 PDF 文本/页数、图片宽高、视频三段时间码及抽帧', {
    pdfPages: 1,
    image: { width: 640, height: 360 },
    videoSegments: segments.map((x) => ({ startMs: x.startMs, endMs: x.endMs })),
    semanticProvider: 'unconfigured',
    formalClipsCreated: 0,
  });
  record('Mock、未配置、损坏原件失败及任务异常隔离', {
    mockJobId: mock.jobId,
    unconfiguredError: 'PROVIDER_NOT_CONFIGURED',
    parserError: 'PDF_PARSE_FAILED',
    realApiStillHealthy: (await req('/projects/' + project.id)).id === project.id,
  });
  const claimInput = {
    text: '验收合成资料称容量为 32 单位（不是现实测量）',
    asOf: '2026-10-23',
    scope: '仅自制验收夹具',
    unit: 'units',
    caveats: '未独立核实，不得用于现实论断',
    verificationStatus: 'unverified',
  };
  const claim = await req(
    `/projects/${project.id}/claims`,
    'POST',
    { ...(await edit()), claim: claimInput },
    201,
  );
  await req(
    `/projects/${project.id}/claims/${claim.id}`,
    'PATCH',
    { ...(await edit()), claim: { ...claimInput, verificationStatus: 'supported' } },
    422,
  );
  await req(
    `/projects/${project.id}/claims/${claim.id}`,
    'PATCH',
    { ...(await edit()), claim: { ...claimInput, verificationStatus: 'verified' } },
    400,
  );
  const support = await req(
    `/projects/${project.id}/research-evidence`,
    'POST',
    {
      ...(await edit()),
      claimId: claim.id,
      sourceId: a.id,
      role: 'support',
      quote: 'Capacity is 32 units.',
      locator: { kind: 'page', page: 1, label: '合成资料第1页' },
    },
    201,
  );
  assert.equal(support.validation, 'matched');
  await req(
    `/projects/${project.id}/research-evidence`,
    'POST',
    {
      ...(await edit()),
      claimId: claim.id,
      sourceId: a.id,
      role: 'context',
      quote: '32 units',
      locator: { kind: 'page', page: 2, label: '' },
    },
    422,
  );
  const supported = await req(`/projects/${project.id}/claims/${claim.id}`, 'PATCH', {
    ...(await edit()),
    claim: { ...claimInput, verificationStatus: 'supported' },
  });
  assert.equal(supported.verificationStatus, 'supported');
  const refute = await req(
    `/projects/${project.id}/research-evidence`,
    'POST',
    {
      ...(await edit()),
      claimId: claim.id,
      sourceId: b.id,
      role: 'refute',
      quote: 'Capacity is 64 units.',
      locator: { kind: 'text', label: '合成资料第1段' },
    },
    201,
  );
  assert.equal(refute.validation, 'matched');
  assert.equal((await workspace()).claims[0].verificationStatus, 'conflicting');
  const other = await create('Phase 03 cross-project guard');
  const foreign = await req(
    `/projects/${other.id}/artifacts`,
    'POST',
    { type: 'research', text: 'Cross project test', inputRevisionIds: [] },
    201,
  );
  await req(
    `/projects/${other.id}/research-evidence`,
    'POST',
    {
      revisionId: foreign.id,
      expectedVersion: foreign.version,
      claimId: claim.id,
      sourceId: a.id,
      role: 'support',
      quote: '32 units',
      locator: { kind: 'text', label: 'x' },
    },
    404,
  );
  const staleVersion = (await current()).version - 1;
  await req(
    `/projects/${project.id}/research-sources/${a.id}`,
    'PATCH',
    { revisionId: first.id, expectedVersion: staleVersion, selected: false },
    409,
  );
  record('Claim 双来源、页码引用、支持/冲突、无证据与跨项目阻断', {
    claimId: claim.id,
    sources: [a.id, b.id],
    evidence: [support.id, refute.id],
    status: 'conflicting',
    verifiedWrite: 400,
    missingEvidence: 422,
    invalidPage: 422,
    crossProject: 404,
    staleVersion: 409,
  });
  const mockClaim = await req(
    `/projects/${project.id}/claims`,
    'POST',
    { ...(await edit()), claim: { ...claimInput, text: 'Mock 内容不能证明此声明' } },
    201,
  );
  const mockEvidence = await req(
    `/projects/${project.id}/research-evidence`,
    'POST',
    {
      ...(await edit()),
      claimId: mockClaim.id,
      sourceId: mockSource.id,
      role: 'support',
      quote: 'Mock 声明，仅演示',
      locator: { kind: 'image', label: '未进行视觉识别' },
    },
    201,
  );
  assert.equal(mockEvidence.validation, 'mock');
  await req(
    `/projects/${project.id}/claims/${mockClaim.id}`,
    'PATCH',
    {
      ...(await edit()),
      claim: { ...claimInput, text: 'Mock 内容不能证明此声明', verificationStatus: 'supported' },
    },
    422,
  );
  record('Mock 引用不能升级支持/核验状态', {
    evidenceValidation: mockEvidence.validation,
    supportedRejected: 422,
  });
  const filePath = `/api/v1/sources/${videoSource.id}/files/${videoSource.blob.id}`;
  assert.equal((await fetch(base + filePath)).status, 401);
  assert.equal(
    (await fetch(base + filePath, { headers: { Cookie: cookie, Range: 'bytes=0-511' } })).status,
    206,
  );
  assert.equal(
    (await fetch(base + filePath, { headers: { Cookie: cookie, Range: 'bytes=99999999999-' } }))
      .status,
    416,
  );
  assert.equal(
    (
      await fetch(base + `/api/v1/sources/${a.id}/files/${videoSource.blob.id}`, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  const head = await fetch(base + filePath, { method: 'HEAD', headers: { Cookie: cookie } });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('content-length')), videoSource.blob.sizeBytes);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  record('来源详情及原件/帧保护、Range、HEAD 与跨来源文件拒绝', {
    anonymous: 401,
    range: 206,
    invalidRange: 416,
    wrongSourceBlob: 404,
  });
  const initialForm = new FormData();
  initialForm.set(
    'brief',
    JSON.stringify({
      title: '初始上传兼容测试',
      prompt: '仅测试已有原件的导入，不迁移用户数据',
      targetDurationMs: 240000,
      width: 1080,
      height: 1920,
      entryType: 'upload',
      voiceMode: 'none',
      budgetLimit: { currency: 'CNY', amount: 50 },
    }),
  );
  initialForm.set('files', new Blob([fs.readFileSync(inputs.text)]), 'initial.txt');
  const initialResponse = await fetch(base + '/api/v1/projects', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: base },
      body: initialForm,
    }),
    initialBody = await initialResponse.json();
  assert.equal(initialResponse.status, 201, JSON.stringify(initialBody));
  const initialProject = initialBody.data,
    initialDraft = await req(
      `/projects/${initialProject.id}/artifacts`,
      'POST',
      { type: 'research', text: '初始原件导入测试', inputRevisionIds: [] },
      201,
    );
  const imported = await req(
    `/projects/${initialProject.id}/research-import-source`,
    'POST',
    {
      revisionId: initialDraft.id,
      expectedVersion: initialDraft.version,
      attachmentId: initialProject.input.attachments[0].id,
    },
    201,
  );
  assert.equal(imported.blob.sha256, initialProject.input.attachments[0].sha256);
  assert.deepEqual(await req('/projects/' + initialProject.id), initialProject);
  record('Phase 00 已有上传原件可加入研究，原项目 JSON/文件不变', {
    sha256: imported.blob.sha256,
    unchanged: true,
  });
  const before = await workspace(),
    review = await req(`/artifacts/${first.artifactId}/revisions/${first.id}/submit`, 'POST', {
      expectedVersion: before.revision.version,
    }),
    approved = await req(`/artifacts/${first.artifactId}/revisions/${first.id}/approve`, 'POST', {
      expectedVersion: review.version,
      comment: '合成资料证据流程通过；不是事实核验',
    });
  await req(
    `/projects/${project.id}/research-sources/${a.id}`,
    'PATCH',
    { revisionId: first.id, expectedVersion: approved.version, selected: false },
    422,
  );
  const frozen = await workspace(first.id),
    snapshot = (d) => ({
      revision: d.revision,
      sources: d.sources,
      claims: d.claims,
      evidence: d.evidence,
      indexes: d.indexes,
    });
  if (db) {
    await assert.rejects(
      db.$executeRawUnsafe(
        "UPDATE research_sources SET document=jsonb_set(document,'{title}','\"tampered\"') WHERE id=$1::uuid",
        a.id,
      ),
      /immutable/,
    );
    const counts = {};
    for (const table of [
      'research_sources',
      'research_claims',
      'research_claim_evidence',
      'research_index_entries',
    ]) {
      const rows = await db.$queryRawUnsafe(
        `SELECT count(*)::int AS count FROM ${table} WHERE project_id=$1::uuid`,
        project.id,
      );
      counts[table] = rows[0].count;
      assert.ok(counts[table] > 0);
      await assert.rejects(
        db.$executeRawUnsafe(
          `UPDATE ${table} SET document=document WHERE project_id=$1::uuid`,
          project.id,
        ),
        /immutable/,
      );
    }
    record('真实 PostgreSQL 四实体持久化与数据库不可变保护', counts);
  } else {
    const { DatabaseSync } = require('node:sqlite'),
      direct = new DatabaseSync(path.join(data, 'studio.db'));
    for (const table of [
      'research_sources',
      'research_claims',
      'research_claim_evidence',
      'research_index_entries',
    ])
      assert.throws(
        () =>
          direct
            .prepare(`UPDATE ${table} SET document=document WHERE project_id=?`)
            .run(project.id),
        /immutable/,
      );
    direct.close();
  }
  const fork = await req(`/artifacts/${first.artifactId}/revisions`, 'POST', {
    revisionId: first.id,
    expectedVersion: approved.version,
  });
  const next = await workspace(fork.id);
  assert.equal(next.sources.length, frozen.sources.length);
  assert.notEqual(next.sources[0].id, frozen.sources[0].id);
  assert.deepEqual(
    next.sources.map((s) => s.blob.id).sort(),
    frozen.sources.map((s) => s.blob.id).sort(),
  );
  assert.ok(
    next.evidence.every(
      (e) =>
        next.sources.some((s) => s.id === e.sourceId) &&
        next.claims.some((c) => c.id === e.claimId),
    ),
  );
  assert.deepEqual(snapshot(await workspace(first.id)), snapshot(frozen));
  record('研究 draft→approve、实体只读、fork 快照及固定依赖', {
    approved: first.id,
    fork: fork.id,
    oldSnapshotUnchanged: true,
  });
  if (!postgres) {
    const recoverSource = await upload(inputs.image, '工具失败重试测试'),
      recovery = await analyze(recoverSource),
      badWorker = worker({ STUDIO_FFPROBE_PATH: path.join(data, 'missing-probe.exe') });
    await badWorker.done;
    const failed = await getJob(recovery.jobId);
    assert.equal(failed.errorCode, 'MEDIA_TOOL_NOT_CONFIGURED');
    await req(`/jobs/${recovery.jobId}/retry`, 'POST', { expectedVersion: failed.version });
    const resumed = worker();
    await resumed.done;
    const recovered = await getJob(recovery.jobId);
    assert.equal(recovered.state, 'succeeded');
    assert.equal(recovered.attempt, 2);
    assert.deepEqual(recovered.researchInput, failed.researchInput);
    record('实际媒体工具失败、同输入第二次尝试恢复成功', {
      jobId: recovery.jobId,
      attempts: recovered.attempts,
    });
    const extra = await upload(inputs.video, '运行取消测试原件'),
      queued = await analyze(extra),
      cw = worker();
    const active = await until(queued.jobId, (j) => j.state === 'running', 30000);
    await req(`/jobs/${queued.jobId}/cancel`, 'POST', { expectedVersion: active.version });
    await cw.done;
    const cancelled = await getJob(queued.jobId);
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.researchResult, undefined);
    assert.equal((await workspace()).indexes.filter((x) => x.sourceId === extra.id).length, 0);
    record('实际运行取消阻断迟到分析写入', { jobId: queued.jobId, state: cancelled.state });
  }
  const { chromium } = appRequire('playwright');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.STUDIO_UI_BROWSER_PATH || process.env.STUDIO_CHROMIUM_PATH,
  });
  const context = await browser.newContext({ viewport: { width: 1800, height: 1150 } }),
    page = await context.newPage();
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${project.id}/research`);
  await page
    .getByRole('button', { name: /合成 PDF 资料 A.*PDF/ })
    .first()
    .click();
  await page
    .getByText('PDF 第 1 页，612×792 pt；文本提取不等于事实核验。', { exact: true })
    .waitFor();
  await pageCapture(page, '03-pdf-conflict.png');
  await page
    .getByRole('button', { name: /自制十秒测试视频.*VIDEO/ })
    .first()
    .click();
  await page.getByRole('button', { name: /跳转 3333 ms/ }).waitFor();
  const v = page.getByLabel('研究原视频');
  await v.evaluate(
    (v) =>
      new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(Error('Video metadata timeout')), 10000);
        if (v.readyState >= 1) {
          clearTimeout(timer);
          ok();
          return;
        }
        v.addEventListener(
          'loadedmetadata',
          () => {
            clearTimeout(timer);
            ok();
          },
          { once: true },
        );
        v.addEventListener(
          'error',
          () => {
            clearTimeout(timer);
            fail(Error(v.error?.message));
          },
          { once: true },
        );
      }),
  );
  await page.getByRole('button', { name: /跳转 3333 ms/ }).click();
  assert.ok(Math.abs((await v.evaluate((v) => v.currentTime)) - 3.333) < 0.1);
  await v.evaluate(
    (v) =>
      new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(Error('Seek decode timeout')), 10000);
        if (!v.seeking && v.readyState >= 2) {
          clearTimeout(timer);
          ok();
          return;
        }
        v.addEventListener(
          'seeked',
          () => {
            clearTimeout(timer);
            ok();
          },
          { once: true },
        );
      }),
  );
  await pageCapture(page, '03-video-index.png');
  await page
    .getByRole('button', { name: /Mock 视觉演示原件.*IMAGE/ })
    .first()
    .click();
  await page
    .getByText('Mock 视觉说明：仅演示内容索引结构，未识别画面，不构成事实证据。', { exact: true })
    .waitFor();
  await page.getByText('查看研究任务和日志', { exact: true }).click();
  await pageCapture(page, '03-mock-and-failure.png');
  await page.getByText('查看研究任务和日志', { exact: true }).click();
  await page.getByLabel('研究文件', { exact: true }).setInputFiles(inputs.image);
  await page.getByLabel('来源标题', { exact: true }).fill('浏览器上传图像 · 合成测试');
  await page.getByRole('button', { name: '上传到当前研究', exact: true }).click();
  await page
    .getByRole('button', { name: /浏览器上传图像 · 合成测试.*IMAGE/ })
    .first()
    .waitFor();
  await page.getByLabel('Claim 内容', { exact: true }).fill('浏览器验收声明：尚未独立核实');
  await page.getByLabel('统计口径 / 范围', { exact: true }).fill('浏览器端到端测试');
  await page.getByRole('button', { name: '保存 Claim', exact: true }).click();
  await page.getByRole('heading', { name: '浏览器验收声明：尚未独立核实', exact: true }).waitFor();
  const fresh = await current();
  await page.getByText('并发版本 ' + fresh.version, { exact: true }).waitFor();
  await page
    .getByLabel('产物文本', { exact: true })
    .fill('浏览器实际保存与审核的研究摘要。资料全部为合成验收夹具，存在冲突，不构成已核实事实。');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByText('草稿已保存', { exact: true }).waitFor();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByRole('button', { name: '批准当前修订', exact: true }).waitFor();
  await page.getByRole('button', { name: '批准当前修订', exact: true }).click();
  await page.getByText('当前修订已批准，下游任务已排队', { exact: true }).waitFor();
  await page
    .getByText('当前资料快照只读。修改已提交或已批准内容时，请在下方创建新修订。', { exact: true })
    .waitFor();
  assert.equal(await page.getByLabel('研究文件', { exact: true }).isDisabled(), true);
  await pageCapture(page, '03-approved.png');
  const browserApproved = await current();
  await page.getByRole('button', { name: '创建新修订', exact: true }).click();
  await page.getByText(/资料快照 v3 · 草稿/).waitFor();
  await page
    .getByRole('button', { name: /合成 PDF 资料 A.*PDF/ })
    .first()
    .click();
  await page.getByRole('combobox', { name: '证据角色', exact: true }).selectOption('context');
  await page.getByRole('combobox', { name: '引用位置类型', exact: true }).selectOption('page');
  await page.getByLabel('PDF 页码', { exact: true }).fill('1');
  await page.getByLabel('原文引用', { exact: true }).fill('Capacity is 32 units.');
  const evidenceResponse = page.waitForResponse(
    (r) => r.url().endsWith('/research-evidence') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存引用证据', exact: true }).click();
  const createdEvidence = await evidenceResponse;
  assert.equal(createdEvidence.status(), 201, await createdEvidence.text());
  assert.equal((await workspace(browserApproved.id)).revision.status, 'approved');
  record('浏览器 fork 后引用绑定当前修订，旧批准版保持只读', {
    oldRevisionId: browserApproved.id,
    newRevisionId: (await current()).id,
    evidenceStatus: 201,
  });
  await page.getByRole('button', { name: /^v1 · 已批准/ }).click();
  await page.getByText(/资料快照 v1 · 已批准/).waitFor();
  await pageCapture(page, '03-history.png');
  await page.setViewportSize({ width: 390, height: 1000 });
  await pageCapture(page, '03-mobile.png');
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Mobile overflow',
  );
  assert.deepEqual(result.pageErrors, []);
  record('真实浏览器：来源/引用/索引、视频定位、上传、Claim、保存审核、历史与移动端', {
    screenshots: 6,
    videoSeekMs: 3333,
    pageErrors: result.pageErrors,
  });
  await browser.close();
  browser = undefined;
  fs.writeFileSync(
    path.join(evidenceDir, 'research-snapshot.json'),
    JSON.stringify(await workspace(), null, 2),
  );
  const saved = await workspace();
  await stopApp();
  await startApp();
  assert.deepEqual(await workspace(), saved);
  assert.equal(protectedHash(), originalHash);
  record('应用重启后持久化、旧数据目录完全保留', {
    originalDataHash: originalHash,
    unchanged: true,
  });
  if (db) {
    const cli = appRequire.resolve('prisma/build/index.js'),
      schema = path.join(appDir, 'prisma/schema.prisma');
    fs.writeFileSync(
      path.join(evidenceDir, 'schema-drift.log'),
      command([
        cli,
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
    record('PostgreSQL Schema 对照零漂移', { exitCode: 0 });
  }
  result.status = 'PASS';
  result.finishedAt = new Date().toISOString();
  save();
}
main()
  .catch(async (e) => {
    if (browser) {
      try {
        const page = browser.contexts()[0]?.pages()[0];
        if (page) {
          await page.screenshot({ path: path.join(data, 'browser-failure.png'), fullPage: true });
          fs.writeFileSync(
            path.join(data, 'browser-failure-aria.txt'),
            await page.locator('body').ariaSnapshot(),
          );
        }
      } catch {}
    }
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

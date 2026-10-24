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
  runId = process.env.STUDIO_ASSET_RESUME_RUN || Date.now().toString(36);
const dataDir = path.join(root, '.cache/phase07', runId),
  evidence = path.join(
    root,
    process.env.STUDIO_TEST_PHASE_EVIDENCE_ROOT || 'docs/evidence/phase07',
    backend,
  ),
  port = backend === 'postgresql' ? 3029 : 3028,
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
  STUDIO_TRUSTED_LOCAL_RENDER: '1',
  STUDIO_CHROMIUM_PATH: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
  result.checks = result.checks.filter((c) => c.name !== name);
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
    timeout: 900000,
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
      Connection: 'close',
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
      title: `Phase 07 ${backend} 合成${entry}验收`,
      prompt: '为什么这个问题值得解释？\n\n第二段用户原文，只是合成测试。',
      entryType: entry,
      voiceMode: 'none',
      targetDurationMs: 20000,
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
    database = 'studio_phase07_' + runId;
  const url = (admin) => {
    const u = new URL(
      'postgresql://127.0.0.1:55432/' + (admin ? 'postgres' : database) + '?schema=public',
    );
    u.username = admin ? credentials.adminUser : credentials.appUser;
    u.password = admin ? credentials.adminPassword : credentials.appPassword;
    return u.href;
  };
  if (process.env.STUDIO_ASSET_RESUME_RUN) {
    result.database = database;
    env.DATABASE_URL = url(false);
    db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    return;
  }
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
      ['show', '34d88410a1f1b1e0a92a4bae548871fcc9c7288f:apps/web/prisma/schema.prisma'],
      { cwd: root },
    ),
  );
  for (const file of fs
    .readdirSync(path.join(appDir, 'prisma/migrations'))
    .filter((f) => f !== '0007_assets'))
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
  assert.equal(migrations.length, 7);
  assert.ok(migrations.every((m) => m.count === 1));
  const role = (
    await db.$queryRawUnsafe('SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user')
  )[0];
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false });
  record('PostgreSQL 0001–0006 基线升级0007、重复部署、非超级用户', { migrations, role });
}
async function nativeWorker(extra = {}, script = 'asset-worker.cjs') {
  const child = spawn(process.execPath, [path.join(root, 'scripts', script), '--once'], {
    cwd: appDir,
    env: { ...env, ...extra },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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

const { blankShot } = require('../../apps/web/src/domain/director.ts');
const aw = (p) => api(`/projects/${p.id}/assets`);
const findJob = async (p, id) => (await wf(p)).jobs.find((j) => j.id === id);
const json = (name, value) =>
  fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + '\n');
const asset = (p, c, status = 200, key) => api(`/projects/${p.id}/assets`, 'POST', c, status, key);
async function capture(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, name), fullPage: true });
}
async function waitWorker(p, job) {
  await worker();
  const j = (await wf(p)).jobs.find((j) => j.id === (job.jobId || job.id));
  assert.equal(
    j.state,
    'succeeded',
    JSON.stringify({ state: j.state, error: j.errorCode, logs: j.logs }),
  );
  return j;
}
async function main() {
  if (backend === 'postgresql') await initializePostgres();
  await startApp();
  if (process.env.STUDIO_ASSET_RESUME_RUN) {
    const old = JSON.parse(fs.readFileSync(path.join(evidence, 'results.json')));
    result.checks = old.checks;
    const checkpoint = JSON.parse(fs.readFileSync(path.join(dataDir, 'checkpoint.json')));
    result.projectId = checkpoint.p.id;
    return complete(checkpoint);
  }
  const p = await project();
  result.projectId = p.id;
  const script = await approve(
    p,
    await api(
      `/projects/${p.id}/script`,
      'POST',
      {
        origin: 'user_provided',
        text: '用自制芯片示意图解释计算概念。\n\n用真实地球图片介绍地球画面。',
      },
      201,
    ),
  );
  await api(
    `/projects/${p.id}/voice-timeline`,
    'POST',
    { scriptRevisionId: script.id, mode: 'none' },
    201,
  );
  let vw = await api(`/projects/${p.id}/voice-timeline`);
  await api(`/projects/${p.id}/voice-timeline`, 'PATCH', {
    revisionId: vw.revision.id,
    expectedVersion: vw.revision.version,
    durationMs: 20000,
    cues: vw.cues,
    subtitles: vw.track.cues,
    alignmentConfirmed: true,
  });
  const voice = await approve(p, (await api(`/projects/${p.id}/voice-timeline`)).revision);
  await api(
    `/projects/${p.id}/director`,
    'POST',
    { scriptRevisionId: script.id, voiceRevisionId: voice.id },
    201,
  );
  let dw = await api(`/projects/${p.id}/director`),
    sw = await workspace(p);
  const shots = sw.segments.map((s, i) => ({
    ...blankShot([s.id], randomUUID(), 300),
    title: i ? 'Earth 真实地球图片' : 'GPU 自制几何示意',
    narrativeGoal: i
      ? '展示真实地球图片与地月画面'
      : '用蓝绿网格和居中芯片矩形示意计算概念，明确是示意动画',
    viewerTakeaway: i ? '看清地球画面' : '理解计算的示意表达，不将示意图冒充实拍',
    startFrame: i * 300,
    endFrame: (i + 1) * 300,
    route: 'pending',
    visualType: 'footage',
    visualSearchIntent: {
      query: i ? 'earth' : 'GPU schematic',
      subject: i ? 'earth' : 'GPU schematic',
      action: i ? 'view from space' : 'abstract rotating grid',
      composition: 'center subject, room for subtitles',
      format: i ? 'image' : 'video',
    },
  }));
  await api(`/projects/${p.id}/director`, 'PATCH', {
    revisionId: dw.revision.id,
    expectedVersion: dw.revision.version,
    shots,
  });
  const director = await approve(p, (await api(`/projects/${p.id}/director`)).revision),
    directorHash = director.contentHash;
  record('批准文稿→确认静默时间轴→批准DirectorRevision，固定shotId/VisualSearchIntent', {
    directorRevisionId: director.id,
    shotIds: shots.map((s) => s.shotId),
    durationFrames: 600,
  });
  const form = new FormData();
  form.set(
    'file',
    new Blob([fs.readFileSync(path.join(root, 'fixtures/assets/gpu-two-scenes.mp4'))], {
      type: 'video/mp4',
    }),
    'gpu-two-scenes.mp4',
  );
  form.set('title', 'GPU schematic two scenes');
  form.set('author', 'Self-authored test');
  form.set('restrictions', 'non-commercial / unknown allowed for internal tests');
  form.set('license', 'unknown');
  const upload = await fetch(base + `/api/v1/projects/${p.id}/asset-upload`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Idempotency-Key': randomUUID() },
    body: form,
  });
  const up = await upload.json();
  assert.equal(upload.status, 202, JSON.stringify(up));
  await waitWorker(p, up.data);
  let w = await aw(p),
    source = w.sources.find((s) => s.provider === 'project');
  assert.equal(source.metadata.durationMs, 12000);
  assert.equal(source.index.frames.length, 6);
  assert.equal(source.index.sourceSha256, source.blob.sha256);
  const originalBlob = source.blob,
    originalBytes = fs.readFileSync(path.join(dataDir, 'asset-blobs', originalBlob.key));
  json('local-index.json', source);
  fs.writeFileSync(
    path.join(evidence, 'local-contact-sheet.jpg'),
    fs.readFileSync(path.join(dataDir, 'asset-blobs', source.index.contactSheet.key)),
  );
  record('真实上传、FFprobe、实际PTS抽帧及联系表', {
    metadata: source.metadata,
    frameTimes: source.index.frames.map((f) => f.atMs),
  });
  let j = await asset(p, {
    action: 'asset-search',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    scope: 'local',
    analysis: 'real',
    query: 'GPU schematic',
    topK: 1,
  });
  j = await waitWorker(p, j);
  assert.ok(
    j.aiRuns?.some((r) => r.provider === 'codex-cli' && r.runId && r.searchMode === 'disabled'),
  );
  w = await aw(p);
  assert.ok(w.candidates.some((c) => c.method === 'real_visual' && c.frameSha256.length));
  json('local-visual-match.json', j);
  record('真实本地素材匹配，Codex实际查看视频帧并保存帧SHA/模型审计', {
    runIds: j.aiRuns.map((r) => r.runId),
  });
  let external = await asset(p, {
    action: 'asset-search',
    directorRevisionId: director.id,
    shotId: shots[1].shotId,
    scope: 'nasa',
    analysis: 'real',
    query: 'earth',
    topK: 1,
  });
  external = await waitWorker(p, external);
  w = await aw(p);
  const externalCandidate = w.candidates.find(
    (c) => c.shotId === shots[1].shotId && c.method === 'real_visual',
  );
  assert.ok(externalCandidate);
  const ext = w.sources.find((s) => s.id === externalCandidate.sourceAssetId);
  assert.equal(ext.provider, 'nasa');
  assert.ok(ext.sourceUrl && ext.downloadUrl && ext.blob && ext.index);
  assert.ok(
    external.assetResult.searches.some(
      (s) => s.provider === 'nasa' && s.status === 'ok' && s.responseSha256,
    ),
  );
  json('external-search-match.json', external);
  json('external-source.json', ext);
  fs.writeFileSync(
    path.join(evidence, 'external-contact-sheet.jpg'),
    fs.readFileSync(path.join(dataDir, 'asset-blobs', ext.index.contactSheet.key)),
  );
  record('真实NASA API检索→受限下载→FFprobe→实际图片Codex视觉匹配', {
    sourceUrl: ext.sourceUrl,
    downloadUrl: ext.downloadUrl,
    author: ext.author,
    restrictions: ext.restrictions,
    sha256: ext.blob.sha256,
    runIds: external.aiRuns.map((r) => r.runId),
  });
  // Two virtual candidates share the exact single original.
  const common = {
    action: 'asset-candidate',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    sourceAssetId: source.id,
  };
  const c1 = await asset(p, { ...common, sourceInMs: 0, sourceOutMs: 6000 }),
    c2 = await asset(p, { ...common, sourceInMs: 6000, sourceOutMs: 12000 });
  assert.equal(c1.sourceAssetId, c2.sourceAssetId);
  assert.equal(
    (await aw(p)).sources.filter((s) => s.blob?.sha256 === originalBlob.sha256).length,
    1,
  );
  await asset(p, { ...common, sourceInMs: -1, sourceOutMs: 6000 }, 400);
  await asset(p, { ...common, sourceInMs: 6000, sourceOutMs: 12001 }, 422);
  record('同源两个区间只保存一份原件，负数/越界拒绝', {
    sourceId: source.id,
    intervals: [
      [0, 6000],
      [6000, 12000],
    ],
    candidateIds: [c1.id, c2.id],
  });
  const bind = (c, version, playback = 'loop') => ({
    action: 'asset-bind',
    directorRevisionId: director.id,
    shotId: c.shotId,
    candidateId: c.id,
    expectedBindingVersion: version,
    sourceInMs: c.sourceInMs,
    sourceOutMs: c.sourceOutMs,
    playback,
    fit: 'cover',
    x: 0.5,
    y: 0.5,
    purpose: 'illustrative',
  });
  await asset(p, bind(c1, 0, 'once'), 422);
  const key = randomUUID(),
    b1 = await asset(p, bind(c1, 0), 200, key);
  assert.equal((await asset(p, bind(c1, 0), 200, key)).id, b1.id);
  await waitWorker(p, { id: b1.jobId });
  let prepared = (await aw(p)).prepared.find((x) => x.recipeHash === b1.recipeHash);
  assert.ok(prepared);
  assert.equal(prepared.metadata.frames, 300);
  assert.equal(prepared.metadata.durationMs, 10000);
  json('prepared-first.json', prepared);
  const inputProbe = await require('../../scripts/asset-media.cjs').probe(
    path.join(dataDir, 'asset-blobs', originalBlob.key),
  );
  const outputProbe = await require('../../scripts/asset-media.cjs').probe(
    path.join(dataDir, 'asset-blobs', prepared.blob.key),
  );
  json('ffprobe-input.json', inputProbe.raw);
  json('ffprobe-prepared.json', outputProbe.raw);
  fs.writeFileSync(path.join(evidence, 'ffmpeg.log'), prepared.log);
  record('真实FFmpeg仅循环选定区间、1080×1920/30FPS/H264/300帧，原件SHA不变', {
    recipeHash: prepared.recipeHash,
    metadata: prepared.metadata,
  });
  const cached = await waitWorker(p, await asset(p, { action: 'asset-prepare', bindingId: b1.id }));
  assert.equal(cached.assetResult.cacheHit, true);
  assert.equal(cached.assetResult.prepared.blob.sha256, prepared.blob.sha256);
  record('同recipeHash重复准备实际缓存命中并复核SHA/FFprobe', { recipeHash: b1.recipeHash });
  const bOther = await asset(p, bind(externalCandidate, 0, 'once'));
  await waitWorker(p, { id: bOther.jobId });
  const snapOther = JSON.stringify((await aw(p)).bindings.find((b) => b.id === bOther.id));
  await asset(p, bind(c2, 0), 409);
  const b2 = await asset(p, bind(c2, 1, 'freeze'));
  await waitWorker(p, { id: b2.jobId });
  w = await aw(p);
  assert.equal(JSON.stringify(w.bindings.find((b) => b.id === bOther.id)), snapOther);
  assert.equal(w.bindings.find((b) => b.id === b1.id).recipeHash, b1.recipeHash);
  assert.equal((await api(`/projects/${p.id}/director`)).revision.contentHash, directorHash);
  assert.deepEqual(
    fs.readFileSync(path.join(dataDir, 'asset-blobs', originalBlob.key)),
    originalBytes,
  );
  record('替换一镜只追加本镜绑定，其他镜头/批准Director/原件/旧产物完整', {
    history: w.bindings.map((b) => ({ id: b.id, version: b.version, shotId: b.shotId })),
  });
  const checkpoint = {
    p,
    script,
    voice,
    director,
    shots,
    source,
    originalBlob,
    c1,
    c2,
    b1,
    b2,
    bOther,
    directorHash,
  };
  fs.writeFileSync(path.join(dataDir, 'checkpoint.json'), JSON.stringify(checkpoint));
  return complete(checkpoint);
}
async function complete(checkpoint) {
  const {
    p,
    script,
    voice,
    director,
    shots,
    source,
    originalBlob,
    c1,
    c2,
    b1,
    b2,
    bOther,
    directorHash,
  } = checkpoint;
  const originalBytes = fs.readFileSync(path.join(dataDir, 'asset-blobs', originalBlob.key));
  let w = await aw(p),
    vw,
    dw;
  const bind = (c, version, playback = 'loop') => ({
    action: 'asset-bind',
    directorRevisionId: director.id,
    shotId: c.shotId,
    candidateId: c.id,
    expectedBindingVersion: version,
    sourceInMs: c.sourceInMs,
    sourceOutMs: c.sourceOutMs,
    playback,
    fit: 'cover',
    x: 0.5,
    y: 0.5,
    purpose: 'illustrative',
  });
  // Real trusted Remotion chain. Its fixed 10s scene overlays trusted text/SVG/subtitles.
  const cachedRender = (await wf(p)).jobs.find(
    (j) =>
      j.provider === 'remotion' &&
      j.state === 'succeeded' &&
      j.renderInput?.preparedBackground?.bindingId === b2.id,
  );
  const rendered = cachedRender
    ? { jobId: cachedRender.id }
    : await api(
        `/projects/${p.id}/render-runs`,
        'POST',
        { presetId: 'poc-v1', titleFontSize: 72, preparedBindingId: b2.id },
        202,
      );
  if (!cachedRender) {
    const native = await nativeWorker({}, 'render-worker.cjs');
    assert.equal(await native.done, 0);
  } else
    record('复用同一测试数据库中已实际完成的可信Remotion任务（测试器HTTP连接失败后续跑）', {
      jobId: cachedRender.id,
    });
  const renderJob = (await wf(p)).jobs.find((j) => j.id === rendered.jobId);
  assert.equal(renderJob.state, 'succeeded', JSON.stringify(renderJob.logs));
  assert.equal(
    renderJob.renderInput.assets.backgroundSha256,
    w.prepared.find((x) => x.recipeHash === b2.recipeHash).blob.sha256,
  );
  const renderDir = path.join(dataDir, 'renders', rendered.jobId, 'attempt-1');
  json('remotion-result.json', renderJob);
  const manifest = JSON.parse(fs.readFileSync(path.join(renderDir, 'manifest.json')));
  assert.equal(manifest.input.preparedBackground.provenance.restrictions, source.restrictions);
  assert.equal(manifest.input.preparedBackground.provenance.sourceInMs, 6000);
  assert.equal(manifest.input.preparedBackground.provenance.license, 'unknown');
  fs.copyFileSync(
    path.join(renderDir, 'manifest.json'),
    path.join(evidence, 'remotion-manifest.json'),
  );
  fs.copyFileSync(
    path.join(renderDir, 'frame-150.png'),
    path.join(evidence, 'remotion-keyframe.png'),
  );
  fs.copyFileSync(
    path.join(renderDir, 'ffprobe.json'),
    path.join(evidence, 'ffprobe-remotion.json'),
  );
  fs.copyFileSync(path.join(renderDir, 'video.mp4'), path.join(evidence, 'internal-poc.mp4'));
  record('PreparedAsset进入既有可信Remotion真实MP4合成、三关键帧重复渲染一致', {
    jobId: rendered.jobId,
    metadata: renderJob.renderResult.metadata,
    determinism: renderJob.renderResult.determinism,
  });
  // Distinct empty, Mock, unconfigured states; cancellation/late result covered by unit and real queue.
  const empty = await waitWorker(
    p,
    await asset(p, {
      action: 'asset-search',
      directorRevisionId: director.id,
      shotId: shots[0].shotId,
      scope: 'local',
      analysis: 'metadata',
      query: 'missingasset_' + randomUUID(),
      topK: 1,
    }),
  );
  assert.equal(empty.assetResult.candidates.length, 0);
  const mock = await waitWorker(
    p,
    await asset(p, {
      action: 'asset-search',
      directorRevisionId: director.id,
      shotId: shots[0].shotId,
      scope: 'mock',
      analysis: 'mock',
      topK: 1,
    }),
  );
  assert.equal(mock.assetResult.candidates.length, 0);
  assert.equal(mock.assetResult.searches[0].status, 'mock');
  const un = await asset(p, {
    action: 'asset-search',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    scope: 'unconfigured',
    analysis: 'real',
    topK: 1,
  });
  await worker();
  assert.equal((await wf(p)).jobs.find((j) => j.id === un.id).errorCode, 'PROVIDER_NOT_CONFIGURED');
  const cancel = await asset(p, {
    action: 'asset-search',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    scope: 'local',
    analysis: 'metadata',
    topK: 1,
  });
  await api(`/jobs/${cancel.id}/cancel`, 'POST', { expectedVersion: cancel.version });
  await worker();
  assert.equal((await wf(p)).jobs.find((j) => j.id === cancel.id).state, 'cancelled');
  record('真实无结果/显式Mock/未配置失败/取消状态互不混淆，短区间必须显式循环或定格');
  const timed = await asset(p, {
    action: 'asset-search',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    scope: 'local',
    analysis: 'metadata',
    query: 'GPU',
    topK: 1,
  });
  const beforeTimeout = (await aw(p)).candidates.length;
  await worker({ STUDIO_ASSET_JOB_TIMEOUT_MS: '100' });
  let timeoutJob = await findJob(p, timed.id);
  assert.equal(timeoutJob.errorCode, 'ASSET_TIMEOUT');
  assert.equal((await aw(p)).candidates.length, beforeTimeout);
  await api(`/jobs/${timed.id}/retry`, 'POST', { expectedVersion: timeoutJob.version });
  await worker();
  assert.equal((await findJob(p, timed.id)).state, 'succeeded');
  const active = await asset(p, {
    action: 'asset-search',
    directorRevisionId: director.id,
    shotId: shots[0].shotId,
    scope: 'local',
    analysis: 'real',
    query: 'GPU',
    topK: 1,
  });
  const native = await nativeWorker();
  const activeJob = await running(p, active.id);
  await api(`/jobs/${active.id}/cancel`, 'POST', { expectedVersion: activeJob.version });
  assert.equal(await native.done, 0);
  assert.equal((await findJob(p, active.id)).state, 'cancelled');
  record('独立真实Worker超时无部分写入、重试成功，running任务取消后不写迟到结果');
  // Auth/ranges and uploaded bytes are never publicly addressable by SHA alone.
  const fileUrl = `/api/v1/projects/${p.id}/asset-files/${originalBlob.key}`;
  assert.equal((await fetch(base + fileUrl)).status, 401);
  const ranged = await fetch(base + fileUrl, { headers: { Cookie: cookie, Range: 'bytes=0-99' } });
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 100);
  const other = await project();
  assert.equal(
    (
      await fetch(base + `/api/v1/projects/${other.id}/asset-files/${originalBlob.key}`, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  record('受保护原件下载支持Range，未认证401，其他项目不能凭SHA读取');
  // Owner-local indexed library reuse does not duplicate the physical original.
  const ss = await approve(
    other,
    await api(
      `/projects/${other.id}/script`,
      'POST',
      { origin: 'user_provided', text: 'GPU 示例。' },
      201,
    ),
  );
  await api(
    `/projects/${other.id}/voice-timeline`,
    'POST',
    { scriptRevisionId: ss.id, mode: 'none' },
    201,
  );
  vw = await api(`/projects/${other.id}/voice-timeline`);
  await api(`/projects/${other.id}/voice-timeline`, 'PATCH', {
    revisionId: vw.revision.id,
    expectedVersion: vw.revision.version,
    durationMs: 20000,
    cues: vw.cues,
    subtitles: vw.track.cues,
    alignmentConfirmed: true,
  });
  const vv = await approve(other, (await api(`/projects/${other.id}/voice-timeline`)).revision);
  await api(
    `/projects/${other.id}/director`,
    'POST',
    { scriptRevisionId: ss.id, voiceRevisionId: vv.id },
    201,
  );
  dw = await api(`/projects/${other.id}/director`);
  const libraryShot = {
    ...shots[0],
    shotId: randomUUID(),
    durationFrames: 600,
    endFrame: 600,
    scriptSegmentIds: [(await workspace(other)).segments[0].id],
  };
  await api(`/projects/${other.id}/director`, 'PATCH', {
    revisionId: dw.revision.id,
    expectedVersion: dw.revision.version,
    shots: [libraryShot],
  });
  const dd = await approve(other, (await api(`/projects/${other.id}/director`)).revision);
  await waitWorker(
    other,
    await asset(other, {
      action: 'asset-search',
      directorRevisionId: dd.id,
      shotId: libraryShot.shotId,
      scope: 'local',
      analysis: 'metadata',
      query: 'GPU',
      topK: 1,
    }),
  );
  assert.ok(
    (await aw(other)).sources.some(
      (a) => a.provider === 'library' && a.blob.sha256 === originalBlob.sha256,
    ),
  );
  record('同所有者已索引本地库可跨项目匹配并复用原件，保持来源');
  // Browser real play, seek, candidate/range edit and persisted page reload.
  const { chromium } = req('playwright');
  browser = await chromium.launch({ executablePath: env.STUDIO_CHROMIUM_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${p.id}/assets`);
  await page.getByLabel('素材镜头').waitFor();
  await capture(page, '07-library.png');
  await page
    .getByRole('button', { name: /GPU schematic two scenes/ })
    .first()
    .click();
  await page.getByLabel('素材入点').fill('6500');
  await page.getByLabel('素材出点').fill('11500');
  await page.getByRole('button', { name: '保存为独立区间候选', exact: true }).click();
  await page.getByRole('status').waitFor();
  const actualCandidate = (await aw(p)).candidates.find(
    (c) => c.sourceInMs === 6500 && c.sourceOutMs === 11500,
  );
  assert.ok(actualCandidate);
  const vid = page.locator('video').first();
  await vid.evaluate(
    (v) =>
      new Promise((ok, no) => {
        const go = () => {
          v.currentTime = 7;
          v.onseeked = () => ok();
        };
        if (v.readyState >= 1) go();
        else v.onloadedmetadata = go;
        v.onerror = no;
      }),
  );
  assert.ok(await vid.evaluate((v) => v.currentTime >= 6.9 && v.duration === 12));
  await vid.evaluate(async (v) => {
    await v.play();
  });
  await page.waitForTimeout(500);
  await vid.evaluate((v) => v.pause());
  assert.ok(await vid.evaluate((v) => v.currentTime > 7));
  await capture(page, '07-range-preview.png');
  // Polling must not silently refresh an editor's expected version.
  await page.getByLabel('短片段策略').selectOption('loop');
  const concurrentVersion = (await aw(p)).bindings
    .filter((b) => b.shotId === shots[0].shotId)
    .reduce((n, b) => Math.max(n, b.version), 0);
  const concurrent = await asset(p, bind(c1, concurrentVersion));
  await page.waitForTimeout(2400);
  await page.getByRole('button', { name: '确认镜头素材并自动准备', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '409' }).waitFor();
  await capture(page, '07-concurrent-409.png');
  await waitWorker(p, { id: concurrent.jobId });
  assert.equal(
    (await aw(p)).bindings.filter((b) => b.shotId === shots[0].shotId).length,
    concurrentVersion + 1,
  );
  assert.ok((await wf(p)).staleRevisionIds.includes(renderJob.resultRevisionId));
  assert.equal((await aw(p)).status.find((s) => s.shotId === shots[1].shotId).bindingId, bOther.id);
  record('浏览器轮询不刷新编辑会话版本：另一窗口更新后确认409；仅本镜成片依赖stale');
  await page.reload();
  await page.getByLabel('素材镜头').waitFor();
  assert.ok((await aw(p)).candidates.some((c) => c.id === actualCandidate.id));
  await page.goto(base + `/projects/${p.id}/storyboard`);
  await page.getByText('本镜头素材使用方案 · 独立版本', { exact: true }).waitFor();
  await capture(page, '06-asset-binding.png');
  await page.goto(base + `/projects/${p.id}/motion`);
  const output = page.locator('video').first();
  await output.waitFor();
  await output.evaluate(async (v) => {
    await v.play();
  });
  await page.waitForTimeout(500);
  assert.ok(await output.evaluate((v) => v.currentTime > 0));
  await capture(page, '08-prepared-remotion.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + `/projects/${p.id}/assets`);
  await page.getByLabel('素材镜头').waitFor();
  await capture(page, '07-mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  record('真实浏览器：源视频播放/拖动、候选区间编辑、刷新持久化、第06/07/08页与移动端');
  const before = await aw(p);
  await stopApp();
  await startApp();
  const after = await aw(p);
  assert.deepEqual(after.bindings, before.bindings);
  assert.deepEqual(after.prepared, before.prepared);
  record('应用重启后素材/绑定历史/准备产物与来源关系一致');
  // Replace approved voice => Director and asset plans stale, no historical mutation.
  const vf = await fork(p, voice);
  await api(`/projects/${p.id}/voice-timeline`, 'PATCH', {
    revisionId: vf.id,
    expectedVersion: vf.version,
    durationMs: 20000,
    cues: (await api(`/projects/${p.id}/voice-timeline`)).cues,
    subtitles: (await api(`/projects/${p.id}/voice-timeline`)).track.cues,
    alignmentConfirmed: true,
  });
  await approve(p, (await api(`/projects/${p.id}/voice-timeline`)).revision);
  assert.equal((await aw(p)).stale, true);
  await asset(p, { action: 'asset-prepare', bindingId: b2.id }, 422);
  record('配音新批准版令Director/素材方案stale，拒绝旧输入准备，历史内容保留');
  assert.equal(originalHash(), beforeHash);
  record('原有用户数据库/上传/会话SHA未改变', { originalDataSha256: beforeHash });
  if (db) {
    fs.writeFileSync(
      path.join(evidence, 'schema-drift.log'),
      command([
        req.resolve('prisma/build/index.js'),
        'migrate',
        'diff',
        '--from-schema-datasource',
        'prisma/schema.prisma',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
        '--script',
      ]),
    );
    record('PostgreSQL Prisma零漂移');
  }
  json('asset-snapshot.json', after);
  assert.deepEqual(result.pageErrors, []);
  result.status = 'PASS';
  result.finishedAt = new Date().toISOString();
  save();
}
main()
  .catch(async (e) => {
    result.status = 'FAIL';
    result.error = safe(e.stack || e);
    save();
    console.error(result.error);
    process.exitCode = 1;
    if (browser) {
      const p = browser.contexts()[0]?.pages()[0];
      if (p) await p.screenshot({ path: path.join(dataDir, 'failure.png'), fullPage: true });
    }
  })
  .finally(async () => {
    if (browser) await browser.close();
    await stopApp();
    if (db) await db.$disconnect();
    fs.writeFileSync(path.join(dataDir, 'app.log'), appLog);
  });

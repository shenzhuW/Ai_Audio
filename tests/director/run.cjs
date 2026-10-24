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
    process.env.STUDIO_TEST_PHASE_EVIDENCE_ROOT || 'docs/evidence/phase06',
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
const sample = require('../../fixtures/director/sample.json');
const { reflowShots, blankShot, shotTime } = require('../../apps/web/src/domain/director.ts');
const director = (p, id) => api(`/projects/${p.id}/director${id ? '?revisionId=' + id : ''}`);
const voice = (p) => api(`/projects/${p.id}/voice-timeline`);
const findJob = async (p, id) => (await wf(p)).jobs.find((j) => j.id === id);
const json = (name, value) =>
  fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + '\n');
async function saveDirector(p, shots, version, status = 200, key) {
  const w = await director(p);
  return api(
    `/projects/${p.id}/director`,
    'PATCH',
    { revisionId: w.revision.id, expectedVersion: version ?? w.revision.version, shots },
    status,
    key,
  );
}
async function generate(p, mode = 'real') {
  const w = await director(p);
  return api(
    `/projects/${p.id}/director-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      mode,
      shotCount: 6,
      instruction:
        '生成完整120秒6镜头解释视频。以批准Cue和实际停顿安排边界，展示一个段落拆成多镜头，也允许跨段落的一镜；不要伪造素材，至少一个纯代码镜头和一个待匹配素材镜头。保持主对象连续，叙事含开场问题、解释、执行路线、总结。',
    },
    202,
  );
}
async function source(p, filename, title) {
  const w = await api(`/projects/${p.id}/research`),
    form = new FormData();
  form.set('file', new Blob([fs.readFileSync(filename)]), path.basename(filename));
  form.set(
    'metadata',
    JSON.stringify({
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      title,
      publisher: 'Self-authored synthetic acceptance',
      creator: 'Test fixture',
      knownRestrictions: 'Self-authored internal development test; no external facts',
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
async function researchEdit(p, section, body, status = 201) {
  const w = await api(`/projects/${p.id}/research`);
  return api(
    `/projects/${p.id}/${section}`,
    'POST',
    { revisionId: w.revision.id, expectedVersion: w.revision.version, ...body },
    status,
  );
}
async function prepare() {
  const p = await project('topic');
  const research = await api(
    `/projects/${p.id}/artifacts`,
    'POST',
    { type: 'research', text: '自制资料，仅验收追溯' },
    201,
  );
  const textFile = path.join(dataDir, 'source.txt');
  fs.writeFileSync(textFile, sample.segments[0].text);
  const sourceText = await source(p, textFile, '自制文稿资料');
  const { fixtures } = require('../research/fixtures.cjs'),
    media = fixtures(path.join(dataDir, 'media'));
  const image = await source(p, media.image || media.png || media[1], '自制图形候选');
  for (const s of [sourceText, image])
    await researchEdit(p, 'research-analysis-runs', { sourceId: s.id, mode: 'real' }, 202);
  command([path.join(root, 'scripts/research-worker.cjs'), '--once']);
  let rw = await api(`/projects/${p.id}/research`);
  assert.ok(rw.sources.find((x) => x.id === image.id).metadata.width > 0);
  const claim = await researchEdit(p, 'claims', {
    claim: {
      text: sample.segments[0].text,
      asOf: '2026-10-24',
      scope: '自制测试',
      unit: '',
      verificationStatus: 'unverified',
      caveats: '自制测试叙述，不是独立核验事实',
    },
  });
  await researchEdit(p, 'research-evidence', {
    claimId: claim.id,
    sourceId: sourceText.id,
    role: 'support',
    quote: sample.segments[0].text,
    locator: { kind: 'text', label: '自制文稿完整段落' },
  });
  rw = await api(`/projects/${p.id}/research`);
  await approve(p, rw.revision);
  await api(
    `/projects/${p.id}/script`,
    'POST',
    {
      origin: 'research',
      researchRevisionId: research.id,
      text: sample.segments.map((s) => s.text).join('\n\n'),
    },
    201,
  );
  let sw = await workspace(p);
  await saveScript(
    p,
    sw.segments.map((s, i) => ({
      ...s,
      factBindings: i === 0 ? [{ claimId: claim.id, sourceIds: [sourceText.id] }] : [],
    })),
  );
  sw = await workspace(p);
  const script = await approve(p, sw.revision);
  await api(
    `/projects/${p.id}/voice-timeline`,
    'POST',
    { scriptRevisionId: script.id, mode: 'import' },
    201,
  );
  let vw = await voice(p),
    form = new FormData();
  const audio = fs.readFileSync(path.join(root, 'fixtures/director/director-120s.wav'));
  assert.equal(createHash('sha256').update(audio).digest('hex'), sample.audioSha256);
  form.set('file', new Blob([audio], { type: 'audio/wav' }), 'director-120s.wav');
  form.set(
    'metadata',
    JSON.stringify({ revisionId: vw.revision.id, expectedVersion: vw.revision.version }),
  );
  const up = await fetch(base + `/api/v1/projects/${p.id}/voice-audio`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Idempotency-Key': randomUUID() },
    body: form,
  });
  assert.equal(up.status, 202);
  await worker();
  vw = await voice(p);
  assert.equal(vw.timeline.durationMs, 120000);
  const cues = sw.segments.map((s, i) => ({
    id: randomUUID(),
    anchorId: randomUUID(),
    segmentId: s.id,
    level: 'phrase',
    startChar: 0,
    endChar: s.text.length,
    segmentTextSha256: createHash('sha256').update(s.text).digest('hex'),
    text: s.text,
    startMs: sample.segments[i].startMs,
    endMs: sample.segments[i].endMs,
    alignment: 'manual',
    confidence: null,
    stale: false,
  }));
  const subs = cues.map((c) => ({
    id: randomUUID(),
    anchorId: c.anchorId,
    segmentId: c.segmentId,
    startMs: c.startMs,
    endMs: c.endMs,
    text: c.text,
  }));
  await api(`/projects/${p.id}/voice-timeline`, 'PATCH', {
    revisionId: vw.revision.id,
    expectedVersion: vw.revision.version,
    durationMs: 120000,
    cues,
    subtitles: subs,
    alignmentConfirmed: true,
  });
  const approvedVoice = await approve(p, (await voice(p)).revision);
  const start = await api(
    `/projects/${p.id}/director`,
    'POST',
    { scriptRevisionId: script.id, voiceRevisionId: approvedVoice.id },
    201,
  );
  record('真实120秒音频导入、FFprobe、固定批准文稿/配音与自制研究来源', {
    projectId: p.id,
    scriptId: script.id,
    voiceId: approvedVoice.id,
    sourceId: sourceText.id,
    imageId: image.id,
    audioSha256: sample.audioSha256,
    alignment: 'manual known assembly offsets; not model/word alignment',
  });
  return { p, script, approvedVoice, image, claim, sourceText, start };
}
function mapTimes(w, xs) {
  return reflowShots(xs).map((shot) => {
    const time = shotTime(shot, w.document),
      overlap = w.cues.filter((c) => c.startMs < time.endMs && c.endMs > time.startMs);
    return {
      ...shot,
      scriptSegmentIds: overlap.length
        ? [...new Set(overlap.map((c) => c.segmentId))]
        : [w.segments[Math.min(3, Math.floor(time.startMs / 30000))].id],
      voiceCueAnchorIds: [],
      claimIds: [],
      sourceIds: shot.media ? [shot.media.sourceId] : [],
    };
  });
}
async function capture(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, name), fullPage: true });
}
async function main() {
  if (backend === 'postgresql') await initializePostgres();
  await startApp();
  const cached = process.env.STUDIO_DIRECTOR_RESUME_RUN
    ? JSON.parse(fs.readFileSync(path.join(evidence, 'real-director-snapshot.json')))
    : null;
  const t = cached
      ? {
          p: { id: cached.projectId },
          script: (await wf({ id: cached.projectId })).revisions.find(
            (r) => r.id === cached.document.scriptRevisionId,
          ),
          approvedVoice: (await wf({ id: cached.projectId })).revisions.find(
            (r) => r.id === cached.document.voiceRevisionId,
          ),
          image: cached.sources.find((s) => s.sourceType === 'image'),
          claim: cached.claims[0],
          sourceText: cached.sources.find((s) => s.sourceType === 'text'),
        }
      : await prepare(),
    { p } = t;
  result.projectId = p.id;
  if (!cached) {
    const no = await generate(p, 'unconfigured');
    await worker();
    assert.equal((await findJob(p, no.jobId)).errorCode, 'PROVIDER_NOT_CONFIGURED');
    assert.equal((await director(p)).shots.length, 0);
    record('未配置Provider明确失败，无假导演结果');
  }
  const real = cached
    ? { jobId: JSON.parse(fs.readFileSync(path.join(evidence, 'real-director-job.json'))).id }
    : await generate(p);
  if (!cached) await worker();
  let j = await findJob(p, real.jobId);
  json('real-director-job.json', j);
  assert.equal(j.state, 'succeeded', JSON.stringify({ code: j.errorCode, runs: j.aiRuns }));
  assert.equal(j.directorResult.mode, 'real');
  assert.ok(j.aiRuns[0].runId);
  assert.equal(j.aiRuns[0].failureReason, null);
  assert.equal(j.aiRuns[0].searchMode, 'disabled');
  if (cached) await saveDirector(p, cached.shots);
  let w = await director(p);
  assert.equal(w.shots.length, 6);
  assert.equal(w.shots.at(-1).endFrame, 3600);
  assert.equal(w.warnings.length, 0);
  assert.ok(w.shots.some((s) => s.route === 'pending'));
  assert.ok(w.shots.some((s) => s.route === 'code'));
  json('real-director-snapshot.json', w);
  json(
    'time-mapping.json',
    w.shots.map((s) => ({
      shotId: s.shotId,
      ...shotTime(s, w.document),
      startFrame: s.startFrame,
      endFrame: s.endFrame,
      segmentIds: s.scriptSegmentIds,
      anchors: s.voiceCueAnchorIds,
      actualCues: w.cues.filter((c) => s.scriptSegmentIds.includes(c.segmentId)),
    })),
  );
  record('真实Codex六镜结构、审计、冻结输入、3600连续帧及Cue引用', {
    jobId: j.id,
    runId: j.aiRuns[0].runId,
    model: j.aiRuns[0].model,
  });
  const originalIds = w.shots.map((x) => x.shotId),
    clone = structuredClone(w.shots);
  for (const patch of [
    { startFrame: 1 },
    { endFrame: 3601 },
    { durationFrames: -1 },
    { scriptSegmentIds: [randomUUID()] },
    { voiceCueAnchorIds: [randomUUID()] },
    { sourceIds: [randomUUID()] },
  ])
    await saveDirector(
      p,
      [{ ...clone[0], ...patch }, ...clone.slice(1)],
      undefined,
      'durationFrames' in patch ? 400 : 422,
    );
  assert.deepEqual((await director(p)).shots, clone);
  record('空隙/重叠/负数/越界及未知文稿/Cue/Source拒绝，事务无部分写入');
  // Explicit 6-shot mapping: split paragraph1 into2; merge paragraphs2+3 in a single shot.
  const durations = [300, 600, 1200, 300, 600, 600];
  let edited = mapTimes(
    w,
    w.shots.map((s, i) => ({ ...s, durationFrames: durations[i] })),
  );
  assert.ok(edited[2].scriptSegmentIds.length === 2);
  assert.equal(edited[0].scriptSegmentIds[0], edited[1].scriptSegmentIds[0]);
  edited[0] = {
    ...edited[0],
    route: 'code',
    media: null,
    visualSearchIntent: { query: '', subject: '', action: '', composition: '', format: 'none' },
    layers: [{ kind: 'graphic', role: 'content', label: '时间河流', depth: 1 }],
  };
  edited[1] = {
    ...edited[1],
    route: 'pending',
    media: null,
    visualSearchIntent: {
      query: '时间轴 声音 可视化',
      subject: '时间轴',
      action: '向前流动',
      composition: '中央对象、保留字幕',
      format: 'video',
    },
  };
  edited[2] = {
    ...edited[2],
    route: 'bound',
    sourceIds: [t.image.id],
    media: { sourceId: t.image.id, sourceInMs: null, sourceOutMs: null, playback: 'freeze' },
  };
  await saveDirector(p, edited);
  w = await director(p);
  assert.deepEqual(
    w.shots.map((s) => s.shotId),
    originalIds,
  );
  assert.equal(w.assetRequirements.length >= 1, true);
  record('一段拆多镜/多段合一镜、纯代码/待匹配/真实候选三方案；blocked授权标记不阻断内部使用');
  const swapped = [w.shots[1], w.shots[0], ...w.shots.slice(2)];
  await saveDirector(p, mapTimes(w, swapped));
  w = await director(p);
  assert.equal(w.shots[0].shotId, originalIds[1]);
  const short = w.shots.map((s, i) => (i ? s : { ...s, durationFrames: s.durationFrames - 30 }));
  await saveDirector(p, mapTimes(w, short));
  w = await director(p);
  assert.equal(w.timing.remainingFrames, 30);
  await api(
    `/artifacts/${w.revision.artifactId}/revisions/${w.revision.id}/submit`,
    'POST',
    { expectedVersion: w.revision.version },
    422,
  );
  short.at(-1).durationFrames += 30;
  await saveDirector(p, mapTimes(w, short));
  record('镜头重排与逐镜时长重算、尾段30帧提示、未覆盖禁止提交');
  w = await director(p);
  const body = { revisionId: w.revision.id, expectedVersion: w.revision.version, shots: w.shots },
    conflicts = await Promise.all([
      raw(`/projects/${p.id}/director`, 'PATCH', body),
      raw(`/projects/${p.id}/director`, 'PATCH', {
        ...body,
        shots: w.shots.map((s, i) => (i ? s : { ...s, title: '并发另一修改' })),
      }),
    ]);
  assert.deepEqual(conflicts.map((x) => x.status).sort(), [200, 409]);
  w = await director(p);
  const key = randomUUID(),
    ib = { revisionId: w.revision.id, expectedVersion: w.revision.version, shots: w.shots };
  const ir = await api(`/projects/${p.id}/director`, 'PATCH', ib, 200, key);
  assert.deepEqual(await api(`/projects/${p.id}/director`, 'PATCH', ib, 200, key), ir);
  record('真实并发200/409与同幂等键重放');
  browser = await req('playwright').chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${p.id}/storyboard`);
  await page.getByLabel('镜头标题', { exact: true }).waitFor();
  await capture(page, '06-director-workbench.png');
  await page.getByLabel('镜头标题', { exact: true }).fill('浏览器修改镜头：声音与画面');
  await page.getByRole('button', { name: '保存导演草稿', exact: true }).click();
  await page.getByText('导演草稿已保存；段落和镜头ID保持稳定。', { exact: true }).waitFor();
  await page.reload();
  assert.equal(
    await page.getByLabel('镜头标题', { exact: true }).inputValue(),
    '浏览器修改镜头：声音与画面',
  );
  await capture(page, '06-edited-persisted.png');
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByRole('button', { name: '批准当前修订', exact: true }).click();
  await page.getByText('当前修订已批准，下游任务已排队', { exact: true }).waitFor();
  await page.waitForTimeout(2200);
  assert.equal(await page.getByLabel('镜头标题', { exact: true }).isEditable(), false);
  await capture(page, '06-approved-readonly.png');
  w = await director(p);
  const approved = w.revision,
    frozen = structuredClone(w.shots);
  await saveDirector(p, w.shots, undefined, 422);
  for (const table of ['director_documents', 'director_shot_versions']) {
    if (db)
      await assert.rejects(
        db.$executeRawUnsafe(
          `UPDATE ${table} SET document=document||'{"tampered":true}'::jsonb WHERE revision_id=$1::uuid`,
          approved.id,
        ),
      );
    else {
      const sqlite = new (require('node:sqlite').DatabaseSync)(path.join(dataDir, 'studio.db'));
      assert.throws(() =>
        sqlite
          .prepare(
            `UPDATE ${table} SET document=json_set(document,'$.tampered',1) WHERE revision_id=?`,
          )
          .run(approved.id),
      );
      sqlite.close();
    }
  }
  record('实际浏览器编辑/刷新/提交/批准只读，API与两张数据库表不可覆写');
  await page.getByRole('button', { name: '创建新修订', exact: true }).click();
  await page.waitForTimeout(2500);
  w = await director(p);
  assert.notEqual(w.revision.id, approved.id);
  assert.deepEqual(
    w.shots.map((s) => s.shotId),
    frozen.map((s) => s.shotId),
  );
  await page.getByLabel('观众理解', { exact: true }).fill('Fork后解释目的变化，保留其他镜头');
  await page.getByRole('button', { name: '保存导演草稿', exact: true }).click();
  await page.waitForTimeout(2000);
  await capture(page, '06-fork-diff.png');
  w = await director(p);
  assert.equal(w.diff.changed.length, 1);
  await review(p, await review(p, w.revision, 'submit'), 'reject', '验收驳回后Fork');
  w = await director(p);
  await fork(p, w.revision);
  assert.deepEqual((await director(p, approved.id)).shots, frozen);
  record('Fork稳定shotId、单镜差异、驳回、历史不变');
  const late = await generate(p, 'mock');
  const current = await director(p);
  await saveDirector(
    p,
    current.shots.map((s, i) => (i ? s : { ...s, title: '迟到结果保护' })),
  );
  await worker();
  assert.equal((await findJob(p, late.jobId)).errorCode, 'TARGET_CHANGED');
  record('异步迟到结果不能覆盖人工编辑');
  const cancel = await generate(p),
    cw = await nativeWorker();
  await running(p, cancel.jobId);
  await new Promise((r) => setTimeout(r, 2500));
  j = await findJob(p, cancel.jobId);
  await api(`/jobs/${j.id}/cancel`, 'POST', { expectedVersion: j.version });
  assert.equal(await cw.done, 0);
  j = await findJob(p, j.id);
  assert.equal(j.state, 'cancelled');
  assert.equal(j.leaseExpiresAt, null);
  json('cancelled-director-job.json', j);
  assert.ok(j.aiRuns?.length);
  record('真实Codex任务取消、心跳与租约回收、取消审计，无导演结果写入');
  const beforeRestart = await director(p);
  await stopApp();
  await startApp();
  const after = await director(p);
  assert.deepEqual(after.shots, beforeRestart.shots);
  assert.deepEqual(after.jobs, beforeRestart.jobs);
  record('应用重启保持导演镜头、稳定ID及真实模型审计');
  const vf = await fork(p, t.approvedVoice);
  let vw = await voice(p);
  await api(`/projects/${p.id}/voice-timeline`, 'PATCH', {
    revisionId: vf.id,
    expectedVersion: vf.version,
    durationMs: 120000,
    cues: vw.cues,
    subtitles: vw.track.cues.map((c, i) => (i ? c : { ...c, text: c.text + '（字幕修订）' })),
    alignmentConfirmed: true,
  });
  await approve(p, (await voice(p)).revision);
  w = await director(p);
  assert.equal(w.impact.stale, true);
  assert.equal(w.impact.voiceChanged, true);
  assert.equal(w.impact.affectedShotIds.length, 6);
  assert.deepEqual((await director(p, approved.id)).shots, frozen);
  record('新配音批准引发导演及镜头依赖失效，批准历史保留');
  const sf = await fork(p, t.script);
  let sw = await workspace(p);
  await saveScript(
    p,
    sw.segments.map((s, i) => (i ? s : { ...s, text: s.text + '补充解释。' })),
  );
  await approve(p, (await workspace(p)).revision);
  assert.equal((await director(p)).impact.scriptChanged, true);
  record('新文稿批准引发导演失效');
  const silent = await project();
  const ss = await approve(
    silent,
    await api(
      `/projects/${silent.id}/script`,
      'POST',
      { origin: 'user_provided', text: '静默测试，只规划字幕和图形。' },
      201,
    ),
  );
  await api(
    `/projects/${silent.id}/voice-timeline`,
    'POST',
    { scriptRevisionId: ss.id, mode: 'none' },
    201,
  );
  vw = await voice(silent);
  await api(`/projects/${silent.id}/voice-timeline`, 'PATCH', {
    revisionId: vw.revision.id,
    expectedVersion: vw.revision.version,
    durationMs: 120000,
    cues: vw.cues,
    subtitles: vw.track.cues,
    alignmentConfirmed: true,
  });
  await approve(silent, (await voice(silent)).revision);
  await api(
    `/projects/${silent.id}/director`,
    'POST',
    { scriptRevisionId: ss.id, voiceRevisionId: (await voice(silent)).revision.id },
    201,
  );
  const mj = await generate(silent, 'mock');
  await worker();
  assert.equal((await findJob(silent, mj.jobId)).state, 'succeeded');
  w = await director(silent);
  assert.ok(w.shots.every((s) => s.voiceCueAnchorIds.length === 0));
  assert.equal(w.document.provenance, 'mock');
  await approve(silent, w.revision);
  await page.goto(base + `/projects/${silent.id}/storyboard`);
  await page.getByText('Mock · 未调用模型', { exact: true }).waitFor();
  await capture(page, '06-silent-explicit-mock.png');
  record('静默120秒计划无伪语音Cue；Mock明确标记且不能代替真实AI样例');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + `/projects/${p.id}/storyboard`);
  await page.getByLabel('镜头标题', { exact: true }).waitFor();
  await capture(page, '06-mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(originalHash(), beforeHash);
  record('原有用户数据库/上传/会话内容SHA未变化', { originalDataSha256: beforeHash });
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
    record('Prisma PostgreSQL零漂移');
  }
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
    if (browser) {
      const p = browser.contexts()[0]?.pages()[0];
      if (p) await p.screenshot({ path: path.join(dataDir, 'failure.png'), fullPage: true });
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await stopApp();
    if (db) await db.$disconnect();
    fs.writeFileSync(path.join(dataDir, 'app.log'), appLog);
  });

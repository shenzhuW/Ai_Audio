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
const dataDir = path.join(root, '.cache/phase05', runId),
  evidence = path.join(
    root,
    process.env.STUDIO_TEST_PHASE_EVIDENCE_ROOT || 'docs/evidence/phase05',
    backend,
  ),
  port = backend === 'postgresql' ? 3016 : 3015,
  base = 'http://127.0.0.1:' + port;
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: '',
  STUDIO_DATA_DIR: dataDir,
  STUDIO_SYSTEM_TTS_ENABLED: '1',
  STUDIO_SPEECH_ENABLED: '1',
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
      title: `Phase 05 ${backend} 合成${entry}验收`,
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
async function worker(extra = {}) {
  const w = await nativeWorker(extra);
  const code = await w.done;
  assert.equal(code, 0, 'Worker exit ' + code);
}
const transcript = '测试，测试。这是配音时间轴的真实语音。字幕和词语时间需要分别校验。';
async function initializePostgres() {
  credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')),
  );
  assert.equal(credentials.host, '127.0.0.1');
  assert.equal(credentials.port, 55432);
  const { PrismaClient } = req('@prisma/client'),
    database = 'studio_phase05_' + runId;
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
      ['show', '3e5e7268f175546fe226e893c71eeb6bb33e69b8:apps/web/prisma/schema.prisma'],
      { cwd: root },
    ),
  );
  for (const file of fs
    .readdirSync(path.join(appDir, 'prisma/migrations'))
    .filter((f) => !['0005_voice','0006_director'].includes(f)))
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
  assert.equal(migrations.length, fs.readdirSync(path.join(appDir,'prisma/migrations'),{withFileTypes:true}).filter(x=>x.isDirectory()).length);
  assert.ok(migrations.every((m) => m.count === 1));
  const role = (
    await db.$queryRawUnsafe('SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user')
  )[0];
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false });
  record('PostgreSQL 0001–0004 基线升级0005、重复部署、非超级用户', { migrations, role });
}
const voice = (p) => api(`/projects/${p.id}/voice-timeline`);
const findJob = async (p, id) => (await wf(p)).jobs.find((j) => j.id === id);
async function startVoice(mode = 'import') {
  const p = await project();
  const script = await approve(
    p,
    await api(
      `/projects/${p.id}/script`,
      'POST',
      { origin: 'user_provided', text: transcript },
      201,
    ),
  );
  await api(`/projects/${p.id}/voice-timeline`, 'POST', { scriptRevisionId: script.id, mode }, 201);
  return { p, script };
}
async function saveVoice(p, change = {}, status = 200, key) {
  const w = await voice(p);
  return api(
    `/projects/${p.id}/voice-timeline`,
    'PATCH',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      durationMs: w.timeline.durationMs,
      cues: w.cues,
      subtitles: w.track.cues,
      alignmentConfirmed: false,
      ...change,
    },
    status,
    key,
  );
}
async function analysis(p, operation) {
  const w = await voice(p);
  return api(
    `/projects/${p.id}/voice-analysis-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      operation,
      provider: 'whisper-local',
    },
    202,
  );
}
async function upload(
  p,
  bytes = fs.readFileSync(path.join(root, 'fixtures/voice/chinese-system-speech.wav')),
  name = 'chinese.wav',
  key = randomUUID(),
  body,
) {
  const w = await voice(p),
    metadata = body || { revisionId: w.revision.id, expectedVersion: w.revision.version },
    form = new FormData();
  form.set('file', new Blob([bytes], { type: 'audio/wav' }), name);
  form.set('metadata', JSON.stringify(metadata));
  const r = await fetch(base + `/api/v1/projects/${p.id}/voice-audio`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Idempotency-Key': key },
    body: form,
  });
  return { status: r.status, body: await r.json() };
}
async function generate(p, provider = 'windows-sapi', purpose = 'final') {
  const w = await voice(p);
  return api(
    `/projects/${p.id}/voice-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      provider,
      purpose,
      voice: 'Microsoft Huihui Desktop',
      rate: 0,
    },
    202,
  );
}
async function screenshot(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, name), fullPage: true });
}
function voiceState(w) {
  return {
    revision: w.revision,
    timeline: w.timeline,
    cues: w.cues,
    track: w.track,
    segments: w.segments,
  };
}
function modelIo(job) {
  const dir = path.join(dataDir, 'voice-work', job.voiceResult.run.runId),
    input = JSON.parse(fs.readFileSync(path.join(dir, 'input.json'))),
    output = JSON.parse(fs.readFileSync(path.join(dir, 'output.json')));
  assert.equal(input.operation, job.voiceInput.operation);
  assert.equal(Object.hasOwn(input, 'text'), input.operation === 'align');
  assert.equal(
    createHash('sha256').update(fs.readFileSync(input.audioPath)).digest('hex'),
    job.voiceResult.audioSha256,
  );
  assert.deepEqual(output.words, job.voiceResult.words);
  if (input.operation === 'transcribe') {
    assert.equal(output.transcript, job.voiceResult.transcript);
    assert.notEqual(output.transcript, transcript);
  } else assert.equal(input.text, job.voiceInput.segments.map((s) => s.text).join('\n'));
  fs.writeFileSync(
    path.join(evidence, `model-${input.operation}-io.json`),
    JSON.stringify(
      {
        jobId: job.id,
        runId: job.voiceResult.run.runId,
        inputKeys: Object.keys(input),
        operation: input.operation,
        language: input.language,
        referenceTextProvided: Object.hasOwn(input, 'text'),
        ...(input.text ? { text: input.text } : {}),
        audioSha256: job.voiceResult.audioSha256,
        modelSha256: output.modelSha256,
        output,
        note: '实际私有input/output的脱敏副本；只删除宿主文件路径，保留原始模型输出。',
      },
      null,
      2,
    ) + '\n',
  );
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
async function main() {
  if (backend === 'postgresql') await initializePostgres();
  await startApp();
  const { p, script } = await startVoice();
  result.projectId = p.id;
  let w = await voice(p);
  assert.equal(w.timeline.audio, null);
  assert.equal(w.timeline.durationMs, 240000);
  await api(
    `/artifacts/${w.revision.artifactId}/revisions/${w.revision.id}/submit`,
    'POST',
    { expectedVersion: w.revision.version },
    422,
  );
  const bad = await upload(p, Buffer.from('not WAV'), 'fake.wav');
  assert.ok([400, 422].includes(bad.status));
  const corrupt = Buffer.from('RIFF0000WAVEbad');
  const cj = await upload(p, corrupt, 'corrupt.wav');
  assert.equal(cj.status, 202);
  await worker();
  assert.equal((await findJob(p, cj.body.data.jobId)).errorCode, 'INVALID_AUDIO_CONTENT');
  const key = randomUUID(),
    meta = { revisionId: w.revision.id, expectedVersion: w.revision.version },
    up = await upload(p, undefined, undefined, key, meta);
  assert.equal(up.status, 202);
  await worker();
  let j = await findJob(p, up.body.data.jobId);
  assert.equal(j.state, 'succeeded', JSON.stringify(j));
  assert.deepEqual((await upload(p, undefined, undefined, key, meta)).body.data, up.body.data);
  w = await voice(p);
  const sha = createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'fixtures/voice/chinese-system-speech.wav')))
    .digest('hex');
  assert.equal(w.timeline.audio.blob.sha256, sha);
  assert.equal(w.timeline.durationMs, 9602);
  assert.equal(w.timeline.audio.codec, 'pcm_s16le');
  const file = base + `/api/v1/projects/${p.id}/voice-files/${w.timeline.audio.blob.id}`;
  assert.equal((await fetch(file)).status, 401);
  const range = await fetch(file, { headers: { Cookie: cookie, Range: 'bytes=0-15' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 16);
  assert.equal((await fetch(file, { method: 'HEAD', headers: { Cookie: cookie } })).status, 200);
  const other = await project();
  assert.equal(
    (await fetch(file.replace(p.id, other.id), { headers: { Cookie: cookie } })).status,
    404,
  );
  record('真实上传、文件签名/FFprobe拒绝损坏、SHA/9602ms、Range/HEAD/鉴权/项目隔离、幂等', {
    sha256: sha,
    durationMs: w.timeline.durationMs,
    audio: w.timeline.audio,
  });
  const asr = await analysis(p, 'transcribe'),
    beforeASR = voiceState(await voice(p));
  await worker({ STUDIO_SPEECH_ENABLED: '0' });
  j = await findJob(p, asr.jobId);
  assert.equal(j.errorCode, 'SPEECH_NOT_CONFIGURED');
  assert.deepEqual(voiceState(await voice(p)), beforeASR);
  await api(`/jobs/${j.id}/retry`, 'POST', { expectedVersion: j.version });
  await worker({ STUDIO_SPEECH_TIMEOUT_MS: '1000' });
  j = await findJob(p, j.id);
  assert.equal(j.errorCode, 'SPEECH_TIMEOUT');
  assert.deepEqual(voiceState(await voice(p)), beforeASR);
  await api(`/jobs/${j.id}/retry`, 'POST', { expectedVersion: j.version });
  await worker();
  j = await findJob(p, j.id);
  assert.equal(j.state, 'succeeded', JSON.stringify(j));
  assert.equal(j.voiceResult.kind, 'asr');
  assert.ok(j.voiceResult.transcript.length > 10);
  assert.equal(j.voiceResult.audioSha256, sha);
  assert.equal(j.voiceRuns.length, 3);
  assert.equal(j.voiceResult.run.referenceTextProvided, false);
  assert.equal(j.voiceResult.run.exitCode, 0);
  fs.writeFileSync(path.join(evidence, 'real-asr.json'), JSON.stringify(j, null, 2) + '\n');
  modelIo(j);
  w = await voice(p);
  assert.ok(w.track.cues.length > 0);
  assert.ok(w.track.cues.every((s) => s.segmentId === null));
  await api(
    `/artifacts/${w.revision.artifactId}/revisions/${w.revision.id}/submit`,
    'POST',
    { expectedVersion: w.revision.version },
    422,
  );
  record('真实中文ASR→未绑定字幕草稿；未配置/超时/重试无部分写入且保留三次审计', {
    transcript: j.voiceResult.transcript,
    runId: j.voiceResult.run.runId,
    model: j.voiceResult.model,
  });
  const align = await analysis(p, 'align');
  await worker();
  j = await findJob(p, align.jobId);
  assert.equal(j.state, 'succeeded', JSON.stringify(j));
  assert.equal(j.voiceResult.kind, 'alignment');
  assert.equal(j.voiceResult.run.referenceTextProvided, true);
  assert.equal(j.voiceResult.audioSha256, sha);
  w = await voice(p);
  assert.ok(w.cues.some((c) => c.level === 'word'));
  assert.ok(w.cues.some((c) => c.level === 'sentence'));
  assert.ok(w.cues.every((c) => c.alignment === 'forced' && c.endMs > c.startMs));
  assert.ok(w.track.cues.every((c) => c.segmentId));
  assert.equal(w.timeline.alignmentConfirmed, false);
  for (const c of w.cues) {
    assert.equal(
      w.segments.find((s) => s.id === c.segmentId).text.slice(c.startChar, c.endChar),
      c.text,
    );
  }
  const words = j.voiceResult.words;
  assert.ok(new Set(words.map((c) => c.endMs - c.startMs)).size > 4);
  const zero = words.filter((c) => c.endMs === c.startMs);
  assert.equal(w.cues.filter((c) => c.level === 'word').length, words.length - zero.length);
  fs.writeFileSync(path.join(evidence, 'real-alignment.json'), JSON.stringify(j, null, 2) + '\n');
  modelIo(j);
  record('真实模型强制句/词对齐、重复词精确位置、非均分、零宽词保留原始但不伪造Cue', {
    runId: j.voiceResult.run.runId,
    zeroWidth: zero,
    wordCues: w.cues.filter((c) => c.level === 'word').length,
    sentences: w.track.cues,
  });
  const spoof = structuredClone(w.cues);
  spoof[0].startMs += 1;
  await saveVoice(p, { cues: spoof }, 422);
  const overlap = structuredClone(w.track.cues);
  overlap[1].startMs = overlap[0].endMs - 1;
  await saveVoice(p, { subtitles: overlap }, 422);
  const out = structuredClone(w.track.cues);
  out[0].endMs = w.timeline.durationMs + 1;
  await saveVoice(p, { subtitles: out }, 422);
  await saveVoice(p, { durationMs: 10000 }, 422);
  browser = await req('playwright').chromium.launch({
    headless: true,
    executablePath:
      process.env.STUDIO_UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=')[1], url: base }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => result.pageErrors.push(String(e)));
  await page.goto(base + `/projects/${p.id}/voice`);
  await page.getByRole('heading', { name: '字幕与时间编辑', exact: true }).waitFor();
  await screenshot(page, '05-real-alignment.png');
  const first = w.track.cues[0];
  await page.waitForFunction(
    () => document.querySelector('audio[aria-label="配音播放器"]')?.readyState >= 2,
  );
  await page.getByLabel('配音播放器', { exact: true }).evaluate(async (a, t) => {
    a.currentTime = (t + 50) / 1000;
    await a.play();
  }, first.startMs);
  await page.waitForFunction(
    (t) => document.querySelector('audio[aria-label="配音播放器"]')?.currentTime > (t + 300) / 1000,
    first.startMs,
    { timeout: 10000 },
  );
  const media = await page.getByLabel('配音播放器', { exact: true }).evaluate((a) => ({
    currentTime: a.currentTime,
    paused: a.paused,
    readyState: a.readyState,
    duration: a.duration,
  }));
  assert.equal(media.paused, false);
  assert.ok(media.currentTime > (first.startMs + 300) / 1000);
  await page.getByTestId('active-subtitle').getByText(first.text, { exact: true }).waitFor();
  await screenshot(page, '05-playing-subtitle.png');
  await page.getByLabel('配音播放器', { exact: true }).evaluate((a) => a.pause());
  assert.ok(Math.abs(media.duration * 1000 - w.timeline.durationMs) <= 1);
  const seekTarget = w.track.cues[2].startMs + 200;
  const slider = page.getByRole('slider', { name: '时间轴定位', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  assert.ok(box);
  const thumb = 8,
    rangeWidth = box.width - 2 * thumb;
  const startX = box.x + thumb + rangeWidth * ((media.currentTime * 1000) / w.timeline.durationMs);
  await page.mouse.move(startX, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + thumb + rangeWidth * (seekTarget / w.timeline.durationMs),
    box.y + box.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    (target) =>
      Math.abs(
        document.querySelector('audio[aria-label="配音播放器"]').currentTime * 1000 - target,
      ) < 200,
    seekTarget,
  );
  await page
    .getByTestId('active-subtitle')
    .getByText(w.track.cues[2].text, { exact: true })
    .waitFor();
  const seeked = await page
    .getByLabel('配音播放器', { exact: true })
    .evaluate((a) => ({ currentTime: a.currentTime, duration: a.duration, paused: a.paused }));
  fs.writeFileSync(
    path.join(evidence, 'playback-seek.json'),
    JSON.stringify(
      {
        status: 'PASS',
        input: 'native range actual mouse drag',
        targetMs: seekTarget,
        seeked,
        timelineDurationMs: w.timeline.durationMs,
      },
      null,
      2,
    ) + '\n',
  );
  await screenshot(page, '05-drag-seek.png');
  await page
    .getByRole('textbox', { name: '第1条字幕', exact: true })
    .fill('测试，测试。（人工修正字幕）');
  await page.getByRole('spinbutton', { name: '字幕1开始（秒）', exact: true }).fill('0.25');
  await page.getByRole('button', { name: '保存时间轴与字幕', exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('textbox', { name: '第1条字幕', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '第1条字幕', exact: true }).inputValue(),
    '测试，测试。（人工修正字幕）',
  );
  assert.equal(
    await page.getByRole('spinbutton', { name: '字幕1开始（秒）', exact: true }).inputValue(),
    '0.25',
  );
  const edited = await voice(p);
  assert.deepEqual(edited.cues, w.cues);
  assert.deepEqual(edited.segments, w.segments);
  assert.equal(edited.track.cues[0].id, first.id);
  await screenshot(page, '05-manual-edit-persisted.png');
  const editSnapshot = voiceState(edited);
  await stopApp();
  await startApp();
  assert.deepEqual(voiceState(await voice(p)), editSnapshot);
  await ctx.clearCookies();
  await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=')[1], url: base }]);
  await page.reload();
  await page.getByRole('textbox', { name: '第1条字幕', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '第1条字幕', exact: true }).inputValue(),
    editSnapshot.track.cues[0].text,
  );
  assert.equal(
    await page.getByRole('spinbutton', { name: '字幕1开始（秒）', exact: true }).inputValue(),
    '0.25',
  );
  fs.writeFileSync(
    path.join(evidence, 'edited-restart.json'),
    JSON.stringify(
      { status: 'PASS', before: editSnapshot, after: voiceState(await voice(p)) },
      null,
      2,
    ) + '\n',
  );
  await screenshot(page, '05-edit-after-restart.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, '05-mobile.png');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('textbox', { name: '第1条字幕', exact: true }).fill('409时保留本地编辑');
  await saveVoice(p);
  await page.getByRole('button', { name: '保存时间轴与字幕', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '409' }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '第1条字幕', exact: true }).inputValue(),
    '409时保留本地编辑',
  );
  await screenshot(page, '05-conflict-buffer.png');
  await page.getByRole('button', { name: '重新载入（放弃本地修改）', exact: true }).click();
  record('真实Chrome解码播放/进度推进/模型字幕时序及人工修改刷新持久化；锚点/文稿不变', {
    media,
    subtitleId: first.id,
    editedStartMs: edited.track.cues[0].startMs,
  });
  w = await voice(p);
  const saveBody = {
    revisionId: w.revision.id,
    expectedVersion: w.revision.version,
    durationMs: w.timeline.durationMs,
    cues: w.cues,
    subtitles: w.track.cues,
    alignmentConfirmed: false,
  };
  const races = await Promise.all([
    raw(`/projects/${p.id}/voice-timeline`, 'PATCH', saveBody),
    raw(`/projects/${p.id}/voice-timeline`, 'PATCH', { ...saveBody, alignmentConfirmed: true }),
  ]);
  assert.deepEqual(races.map((x) => x.status).sort(), [200, 409]);
  const idemKey = randomUUID();
  w = await voice(p);
  const idemBody = { ...saveBody, expectedVersion: w.revision.version };
  const idem = await api(`/projects/${p.id}/voice-timeline`, 'PATCH', idemBody, 200, idemKey);
  assert.deepEqual(
    await api(`/projects/${p.id}/voice-timeline`, 'PATCH', idemBody, 200, idemKey),
    idem,
  );
  await saveVoice(p, { alignmentConfirmed: true });
  w = await voice(p);
  const approved = await approve(p, w.revision);
  const frozen = voiceState(await voice(p));
  await saveVoice(p, {}, 422);
  await page.reload();
  await page.getByRole('textbox', { name: '第1条字幕', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '第1条字幕', exact: true }).isDisabled(),
    true,
  );
  await screenshot(page, '05-approved-readonly.png');
  if (backend === 'postgresql') {
    for (const table of ['voice_timelines', 'voice_cue_versions', 'subtitle_tracks']) {
      await assert.rejects(() =>
        db.$executeRawUnsafe(
          `UPDATE ${table} SET document=document WHERE revision_id=$1::uuid`,
          approved.id,
        ),
      );
      await assert.rejects(() =>
        db.$executeRawUnsafe(`DELETE FROM ${table} WHERE revision_id=$1::uuid`, approved.id),
      );
    }
  } else {
    const { DatabaseSync } = require('node:sqlite'),
      sq = new DatabaseSync(path.join(dataDir, 'studio.db'));
    for (const table of ['voice_timelines', 'voice_cue_versions', 'subtitle_tracks']) {
      assert.throws(() =>
        sq.prepare(`UPDATE ${table} SET document=document WHERE revision_id=?`).run(approved.id),
      );
      assert.throws(() => sq.prepare(`DELETE FROM ${table} WHERE revision_id=?`).run(approved.id));
    }
    sq.close();
  }
  const consumer = await approve(
    p,
    await api(
      `/projects/${p.id}/artifacts`,
      'POST',
      {
        type: 'storyboard',
        text: 'Synthetic dependency record only; no DirectorShot implementation',
        inputRevisionIds: [approved.id],
      },
      201,
    ),
  );
  const fr = await fork(p, approved);
  w = await voice(p);
  assert.deepEqual(w.cues, frozen.cues);
  assert.equal(w.track.trackId, frozen.track.trackId);
  await saveVoice(p, {
    subtitles: w.track.cues.map((s, i) => (i ? s : { ...s, text: 'Fork独立字幕' })),
  });
  assert.deepEqual(
    voiceState(await api(`/projects/${p.id}/voice-timeline?revisionId=${approved.id}`)),
    frozen,
  );
  record('并发409、幂等、批准API/数据库不可变、Fork逻辑ID与历史原件保持', {
    approvedRevision: approved.id,
    forkRevision: fr.id,
    statuses: races.map((x) => x.status),
  });
  await saveVoice(p, { alignmentConfirmed: true });
  const revisedVoice = await approve(p, (await voice(p)).revision);
  assert.ok((await wf(p)).staleRevisionIds.includes(consumer.id));
  await fork(p, revisedVoice);
  record('配音字幕新批准修订使合成下游依赖失效', {
    consumer: consumer.id,
    syntheticDependencyOnly: true,
  });
  const late = await analysis(p, 'align'),
    lateBefore = voiceState(await voice(p));
  const rw = await nativeWorker();
  await running(p, late.jobId);
  await saveVoice(p, {
    subtitles: (await voice(p)).track.cues.map((s, i) =>
      i ? s : { ...s, text: '异步任务不能覆盖此修改' },
    ),
  });
  await rw.done;
  j = await findJob(p, late.jobId);
  assert.equal(j.errorCode, 'TARGET_CHANGED');
  fs.writeFileSync(path.join(evidence, 'stale-result-job.json'), JSON.stringify(j, null, 2) + '\n');
  assert.equal((await voice(p)).track.cues[0].text, '异步任务不能覆盖此修改');
  const cancel = await analysis(p, 'transcribe'),
    beforeCancel = voiceState(await voice(p)),
    cw = await nativeWorker();
  await running(p, cancel.jobId);
  await new Promise((r) => setTimeout(r, 2400));
  j = await findJob(p, cancel.jobId);
  await api(`/jobs/${j.id}/cancel`, 'POST', { expectedVersion: j.version });
  await cw.done;
  j = await findJob(p, j.id);
  assert.equal(j.state, 'cancelled');
  assert.equal(j.leaseExpiresAt, null);
  fs.writeFileSync(path.join(evidence, 'cancelled-job.json'), JSON.stringify(j, null, 2) + '\n');
  if (j.voiceRuns.at(-1)?.processId) {
    assert.throws(() => process.kill(j.voiceRuns.at(-1).processId, 0));
  }
  assert.deepEqual(voiceState(await voice(p)), beforeCancel);
  record('真实模型运行取消/心跳/租约清空、异步旧版本结果不写入', {
    cancelledJob: j.id,
    lateJob: late.jobId,
    error: 'TARGET_CHANGED',
  });
  const rep = await upload(p);
  assert.equal(rep.status, 202);
  await worker();
  w = await voice(p);
  assert.ok(w.cues.every((c) => c.stale));
  assert.equal(w.timeline.alignmentConfirmed, false);
  await saveVoice(p, { alignmentConfirmed: true }, 422);
  record('音频替换后锚点失效、阻止错误确认');
  const t = await startVoice('tts');
  const tj = await generate(t.p, 'unconfigured');
  await worker();
  assert.equal((await findJob(t.p, tj.jobId)).errorCode, 'VOICE_TTS_NOT_CONFIGURED');
  const mj = await generate(t.p, 'mock');
  await worker();
  assert.equal((await findJob(t.p, mj.jobId)).errorCode, 'VOICE_MOCK_NO_AUDIO');
  assert.equal((await voice(t.p)).timeline.audio, null);
  const v0 = (await voice(t.p)).revision.version,
    pre = await generate(t.p, 'windows-sapi', 'preview');
  await worker();
  let pj = await findJob(t.p, pre.jobId);
  assert.equal(pj.state, 'succeeded', JSON.stringify(pj));
  assert.equal(pj.voiceResult.audio.purpose, 'preview');
  assert.equal((await voice(t.p)).timeline.audio, null);
  assert.equal((await voice(t.p)).revision.version, v0);
  const full = await generate(t.p);
  await worker();
  pj = await findJob(t.p, full.jobId);
  assert.equal(pj.state, 'succeeded', JSON.stringify(pj));
  assert.ok((await voice(t.p)).timeline.audio.durationMs > 5000);
  result.ttsProjectId = t.p.id;
  await page.goto(base + `/projects/${t.p.id}/voice`);
  await page.getByLabel('配音播放器', { exact: true }).waitFor();
  await screenshot(page, '05-real-system-tts.png');
  record('TTS真实Windows系统声音、预览/正式隔离、云未配置与Mock明确失败', {
    audio: pj.voiceResult.audio,
    note: '真实系统TTS；非神经模型，不宣称Codex可合成音频',
  });
  const silent = await startVoice('none');
  w = await voice(silent.p);
  assert.equal(w.timeline.audio, null);
  assert.ok(w.cues.every((c) => c.alignment === 'planned'));
  const ds = 180000 / 240000;
  await saveVoice(silent.p, {
    durationMs: 180000,
    cues: w.cues.map((c) => ({
      ...c,
      startMs: Math.round(c.startMs * ds),
      endMs: Math.round(c.endMs * ds),
    })),
    subtitles: w.track.cues.map((c) => ({
      ...c,
      startMs: Math.round(c.startMs * ds),
      endMs: Math.round(c.endMs * ds),
    })),
    alignmentConfirmed: true,
  });
  w = await voice(silent.p);
  await api(
    `/projects/${silent.p.id}/voice-analysis-runs`,
    'POST',
    {
      revisionId: w.revision.id,
      expectedVersion: w.revision.version,
      operation: 'align',
      provider: 'whisper-local',
    },
    422,
  );
  await approve(silent.p, w.revision);
  result.silentProjectId = silent.p.id;
  await page.goto(base + `/projects/${silent.p.id}/voice`);
  await page.getByText('静默编排，没有音频、转录或语音置信度。', { exact: true }).waitFor();
  await screenshot(page, '05-silent-timeline.png');
  record('无口播180秒静默计划、真实持久化/批准、无音频转录或伪对齐');
  const sf = await fork(p, script);
  const sw = await workspace(p);
  await saveScript(
    p,
    sw.segments.map((s, i) => (i ? s : { ...s, text: s.text + '文稿更新。' })),
  );
  await approve(p, (await workspace(p)).revision);
  w = await voice(p);
  assert.equal(w.impact.stale, true);
  assert.equal(w.impact.scriptChanged, true);
  assert.ok(w.impact.affectedAnchorIds.length > 0);
  assert.deepEqual(
    voiceState(await api(`/projects/${p.id}/voice-timeline?revisionId=${approved.id}`)),
    frozen,
  );
  record('批准新文稿使旧配音/锚点失效；旧批准历史不覆写');
  const beforeRestart = voiceState(await voice(t.p));
  await stopApp();
  await startApp();
  assert.deepEqual(voiceState(await voice(t.p)), beforeRestart);
  assert.equal((await voice(p)).jobs.find((j) => j.id === asr.jobId).voiceResult.audioSha256, sha);
  assert.equal(originalHash(), beforeHash);
  record('应用重启后音频/字幕/真实模型结果关系保留，原有用户数据SHA未变化', {
    originalDataSha256: beforeHash,
  });
  if (backend === 'postgresql') {
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
    record('PostgreSQL Prisma Schema零漂移');
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
    console.error(result.error, e.cause || '');
    if (browser) {
      const p = browser.contexts()[0]?.pages()[0];
      if (p) {
        await p.screenshot({ path: path.join(dataDir, 'failure.png'), fullPage: true });
        fs.writeFileSync(
          path.join(dataDir, 'failure-aria.txt'),
          await p.locator('body').ariaSnapshot(),
        );
      }
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await stopApp();
    if (db) await db.$disconnect();
    fs.writeFileSync(path.join(dataDir, 'app.log'), appLog);
  });

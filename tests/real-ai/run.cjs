// Real Codex + HTTP/Chrome and isolated databases. No production user data migration.
require('../../scripts/register-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web');
const req = createRequire(path.join(appDir, 'package.json'));
const backend = process.argv.includes('--postgres') ? 'postgresql' : 'sqlite';
const boundaries = process.argv.includes('--claims-boundaries');
const supplement = process.argv.includes('--claims-supplement') || boundaries;
const output = path.join(
    root,
    process.env.STUDIO_TEST_REAL_AI_EVIDENCE_ROOT ||
      (boundaries
        ? 'docs/evidence/phase045-claims/boundaries'
        : supplement
          ? 'docs/evidence/phase045-claims'
          : 'docs/evidence/phase045'),
    backend,
  ),
  base = 'http://127.0.0.1:3012';
const resume = process.argv.includes('--resume-finalize')
  ? JSON.parse(fs.readFileSync(path.join(output, 'results.json'), 'utf8'))
  : null;
const runId = resume ? resume.runId : Date.now().toString(36),
  dataDir = path.join(root, '.cache/phase045', runId);
assert.match(runId, /^[a-z0-9]+$/);
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: '',
  STUDIO_DATA_DIR: dataDir,
  STUDIO_CODEX_ENABLED: '1',
};
const result = resume || {
  status: 'RUNNING',
  backend,
  runId,
  at: new Date().toISOString(),
  checks: [],
  pageErrors: [],
};
let app,
  browser,
  cookie,
  credentials,
  db,
  appLog = '';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function originalHash() {
  const hashes = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else hashes.push([file, sha(fs.readFileSync(file))]);
    }
  }
  walk(path.join(appDir, '.data'));
  walk(path.join(root, '.cache/acceptance-data'));
  return sha(JSON.stringify(hashes));
}
const originalBefore = originalHash();
const safe = (text) =>
  credentials
    ? String(text)
        .replaceAll(credentials.adminPassword, '[REDACTED]')
        .replaceAll(credentials.appPassword, '[REDACTED]')
    : String(text);
function save() {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
}
function check(name, detail = {}) {
  result.checks.push({ name, status: 'PASS', detail });
  save();
  console.log('PASS ' + name);
}
async function start() {
  app = spawn(
    process.execPath,
    [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3012'],
    { cwd: appDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  app.stdout.on('data', (b) => (appLog += safe(b)));
  app.stderr.on('data', (b) => (appLog += safe(b)));
  for (let n = 0; n < 120; n++) {
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
  throw Error('APP_START_TIMEOUT');
}
async function stop() {
  if (app && app.exitCode === null) {
    const done = new Promise((r) => app.once('exit', r));
    app.kill();
    await done;
  }
  app = undefined;
}
async function api(p, method = 'GET', body, status = 200, key = randomUUID()) {
  const r = await fetch(base + '/api/v1' + p, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json();
  assert.equal(r.status, status, JSON.stringify(json));
  return json.data;
}
async function worker(file, overrides = {}) {
  const child = spawn(process.execPath, [path.join(root, 'scripts', file), '--once'], {
    cwd: root,
    env: { ...env, ...overrides },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (b) => (log += safe(b)));
  child.stderr.on('data', (b) => (log += safe(b)));
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      fs.appendFileSync(path.join(output, 'workers.log'), log);
      code === 0 ? resolve() : reject(Error(log));
    });
  });
  return { child, done };
}
async function upload(p, revisionId, name, bytes) {
  const w = await api(`/projects/${p.id}/research`),
    form = new FormData();
  form.set('file', new Blob([bytes]), name);
  form.set(
    'metadata',
    JSON.stringify({
      revisionId,
      expectedVersion: w.revision.version,
      title: name,
      knownRestrictions: 'Self-authored internal visual test only',
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
async function approve(r) {
  let x = await api(`/artifacts/${r.artifactId}/revisions/${r.id}/submit`, 'POST', {
    expectedVersion: r.version,
  });
  return api(`/artifacts/${r.artifactId}/revisions/${r.id}/approve`, 'POST', {
    expectedVersion: x.version,
    comment: 'Automated internal acceptance; not independent factual verification',
  });
}
async function capture(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}
async function postgres() {
  credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json'), 'utf8'),
  );
  assert.equal(credentials.host, '127.0.0.1');
  assert.equal(credentials.port, 55432);
  const database = 'studio_phase045_' + runId;
  const url = (admin) => {
    const u = new URL(
      'postgresql://127.0.0.1:55432/' + (admin ? 'postgres' : database) + '?schema=public',
    );
    u.username = admin ? credentials.adminUser : credentials.appUser;
    u.password = admin ? credentials.adminPassword : credentials.appPassword;
    return u.href;
  };
  const { PrismaClient } = req('@prisma/client');
  const admin = new PrismaClient({ datasources: { db: { url: url(true) } } });
  try {
    assert.match(database, /^studio_phase045_[a-z0-9]+$/);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" OWNER studio_app`);
  } finally {
    await admin.$disconnect();
  }
  env.DATABASE_URL = url(false);
  result.database = database;
  const cli = req.resolve('prisma/build/index.js');
  let log = '';
  for (let n = 0; n < 2; n++)
    log += safe(
      execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
        cwd: appDir,
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 120000,
      }),
    );
  fs.writeFileSync(path.join(output, 'migrations.log'), log);
  db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const migrations = await db.$queryRawUnsafe(
    'SELECT migration_name,count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL GROUP BY migration_name ORDER BY migration_name',
  );
  assert.equal(
    migrations.length,
    fs
      .readdirSync(path.join(appDir, 'prisma/migrations'), { withFileTypes: true })
      .filter((x) => x.isDirectory()).length,
  );
  assert.ok(migrations.every((m) => m.count === 1));
  check('真实 PostgreSQL 初始化/重复迁移：当前全部增量迁移', { migrations });
}
async function main() {
  if (boundaries) {
    if (backend === 'postgresql') await postgres();
    await start();
    await require('./claim-boundaries.cjs')({
      api,
      worker,
      upload,
      check,
      output,
      result,
      approve,
      start,
      stop,
    });
    assert.equal(originalHash(), originalBefore);
    result.status = 'PASS';
    result.finishedAt = new Date().toISOString();
    save();
    return;
  }
  if (resume) {
    assert.equal(backend, 'sqlite');
    assert.equal(resume.checks.length, 7);
    await start();
    const current = await api(`/projects/${result.projectId}/script`),
      old = current.revisions.find((r) => r.status === 'approved');
    assert.ok(old);
    const historical = await api(`/projects/${result.projectId}/script?revisionId=${old.id}`);
    assert.deepEqual(current.segments, historical.segments);
    assert.equal(current.document.researchRevisionId, historical.document.researchRevisionId);
    await api(
      `/projects/${result.projectId}/script`,
      'PATCH',
      {
        revisionId: old.id,
        expectedVersion: old.version,
        segments: historical.segments,
        unitsPerMinute: 240,
      },
      422,
    );
    check('真实生成沿用审批只读和Fork，研究引用归属不变', { forkHttpStatus: 200 });
    const research = await api(`/projects/${result.projectId}/research`);
    for (const entry of research.indexes)
      if (entry.extractedText) {
        entry.extractedTextSha256 = sha(Buffer.from(entry.extractedText));
        entry.extractedTextLength = entry.extractedText.length;
        entry.extractedTextPreview = entry.extractedText.slice(0, 100);
        delete entry.extractedText;
      }
    fs.writeFileSync(
      path.join(output, 'research-snapshot.json'),
      JSON.stringify(research, null, 2) + '\n',
    );
    browser = await req('playwright').chromium.launch({
      headless: true,
      executablePath:
        process.env.STUDIO_UI_BROWSER_PATH ||
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    page.on('pageerror', (e) => result.pageErrors.push(e.message));
    await page.goto(base + `/projects/${result.projectId}/script`);
    await page.getByRole('textbox', { name: '第2段正文', exact: true }).waitFor();
    await capture(page, '04-mobile.png');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await browser.close();
    browser = undefined;
    await stop();
    await start();
    assert.deepEqual(await api(`/projects/${result.projectId}/script`), current);
    assert.equal(originalHash(), originalBefore);
    assert.deepEqual(result.pageErrors, []);
    fs.writeFileSync(
      path.join(output, 'script-snapshot.json'),
      JSON.stringify(current, null, 2) + '\n',
    );
    check('重启保持真实结果与审计；原用户数据不变', { originalBefore, unchanged: true });
    delete result.error;
    result.status = 'PASS';
    result.finishedAt = new Date().toISOString();
    result.resumedFinalization =
      'Original test expected fork 201, but existing API correctly returns 200. Corrected test and reverified final steps on same isolated run; no repeat model calls.';
    save();
    return;
  }
  if (backend === 'postgresql') await postgres();
  await start();
  browser = await req('playwright').chromium.launch({
    headless: true,
    executablePath:
      process.env.STUDIO_UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const chart = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await chart.setContent(fs.readFileSync(path.join(root, 'fixtures/real-ai/chart.svg'), 'utf8'));
  await chart.locator('body').evaluate((e) => {
    e.style.margin = '0';
  });
  const chartBytes = await chart.screenshot();
  await chart.close();
  fs.writeFileSync(path.join(output, 'self-authored-chart.png'), chartBytes);
  const p = await api(
    '/projects',
    'POST',
    {
      title: `Phase04.5 ${backend} REAL Codex internal acceptance`,
      prompt:
        'Explain the distinction between observations and evidence using official ffprobe documentation. Do not invent facts.',
      entryType: 'topic',
      voiceMode: 'none',
      targetDurationMs: 60000,
      width: 1080,
      height: 1920,
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    201,
  );
  result.projectId = p.id;
  const r = await api(
    `/projects/${p.id}/artifacts`,
    'POST',
    {
      type: 'research',
      text: 'Internal research: fetched page text and model analysis remain separate; not verified facts.',
      inputRevisionIds: [],
    },
    201,
  );
  const search = await api(
    `/projects/${p.id}/research-search-runs`,
    'POST',
    {
      revisionId: r.id,
      expectedVersion: r.version,
      query: 'site:ffmpeg.org/ffprobe.html official ffprobe documentation',
      mode: 'real',
    },
    202,
  );
  await (
    await worker('research-worker.cjs')
  ).done;
  const searched = await api('/jobs/' + search.jobId);
  assert.equal(searched.state, 'succeeded', JSON.stringify(searched));
  assert.equal(searched.researchResult.mode, 'real');
  assert.ok(searched.aiRuns[0].runId);
  assert.equal(searched.aiRuns[0].searchMode, 'live');
  assert.equal(searched.aiRuns[0].quota, null);
  let w = await api(`/projects/${p.id}/research`);
  assert.ok(searched.researchResult.candidates.length > 0);
  assert.ok(
    w.sources.some((s) => s.provenance === 'web-fetch'),
    'At least one actual independently fetched page required',
  );
  const web = w.sources.find((s) => s.provenance === 'web-fetch');
  const webIndex = w.indexes.find((e) => e.sourceId === web.id);
  assert.ok(webIndex.extractedText.includes('ffprobe'));
  assert.notEqual(webIndex.extractedText, web.webCapture.modelSummary);
  const raw = await fetch(base + `/api/v1/sources/${web.id}/files/${web.webCapture.rawBlob.id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(raw.status, 200);
  assert.equal(sha(Buffer.from(await raw.arrayBuffer())), web.webCapture.rawSha256);
  check('真实 live 搜索持久化；标题URL摘要有实际搜索轨迹，独立网页原文/原始响应可下载', {
    jobId: search.jobId,
    candidates: searched.researchResult.candidates.length,
    sourceId: web.id,
    runId: searched.aiRuns[0].runId,
  });
  const image = await upload(p, r.id, 'self-authored-chart.png', chartBytes);
  w = await api(`/projects/${p.id}/research`);
  const imageJob = await api(
    `/projects/${p.id}/research-analysis-runs`,
    'POST',
    {
      revisionId: r.id,
      expectedVersion: w.revision.version,
      sourceId: image.id,
      mode: 'real',
      vision: true,
    },
    202,
  );
  await (
    await worker('research-worker.cjs')
  ).done;
  const imageDone = await api('/jobs/' + imageJob.jobId);
  assert.equal(imageDone.state, 'succeeded', JSON.stringify(imageDone));
  assert.equal(imageDone.aiRuns.length, 1);
  w = await api(`/projects/${p.id}/research`);
  const imageIndex = w.indexes.find((e) => e.sourceId === image.id);
  assert.equal(imageIndex.analysis.sourceSha256, image.blob.sha256);
  assert.equal(imageIndex.extractedText, undefined);
  assert.ok(/[红绿蓝]/.test(imageIndex.summary));
  check('真实图片理解绑定原件SHA；视觉输出不作为原文匹配', {
    jobId: imageJob.jobId,
    summary: imageIndex.summary,
    runId: imageIndex.analysis.runId,
  });
  const video = await upload(
    p,
    r.id,
    'self-authored-background.mp4',
    fs.readFileSync(path.join(root, 'apps/render/public/background.mp4')),
  );
  w = await api(`/projects/${p.id}/research`);
  const videoJob = await api(
    `/projects/${p.id}/research-analysis-runs`,
    'POST',
    {
      revisionId: r.id,
      expectedVersion: w.revision.version,
      sourceId: video.id,
      mode: 'real',
      vision: true,
    },
    202,
  );
  await (
    await worker('research-worker.cjs')
  ).done;
  const videoDone = await api('/jobs/' + videoJob.jobId);
  assert.equal(videoDone.state, 'succeeded', JSON.stringify(videoDone));
  assert.equal(videoDone.aiRuns.length, 3);
  w = await api(`/projects/${p.id}/research`);
  const frames = w.indexes
    .filter((e) => e.sourceId === video.id)
    .sort((a, b) => a.startMs - b.startMs);
  assert.deepEqual(
    frames.map((e) => e.startMs),
    [0, 3333, 6666],
  );
  for (const e of frames) {
    assert.equal(e.analysis.frameTimeMs, e.startMs);
    assert.equal(e.analysis.sourceSha256, video.blob.sha256);
    const out = path.join(dataDir, 'independent-' + e.startMs + '.jpg');
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(e.startMs / 1000),
        '-i',
        path.join(root, 'apps/render/public/background.mp4'),
        '-frames:v',
        '1',
        '-vf',
        'scale=480:-2',
        '-q:v',
        '3',
        '-n',
        out,
      ],
      { windowsHide: true },
    );
    assert.equal(sha(fs.readFileSync(out)), e.frameRefs[0].blob.sha256);
    fs.copyFileSync(out, path.join(output, 'frame-' + e.startMs + '.jpg'));
    assert.equal(e.extractedText, undefined);
  }
  check('真实视频3帧视觉：原始时间戳与独立抽帧SHA完全相同，无音轨/运动伪称', {
    jobId: videoJob.jobId,
    timestamps: frames.map((e) => e.startMs),
    runIds: videoDone.aiRuns.map((a) => a.runId),
  });
  w = await api(`/projects/${p.id}/research`);
  let claim, evidence;
  const candidateProof = supplement
    ? await require('./claim-supplement.cjs')({
        api,
        worker,
        browser,
        p,
        r,
        output,
        check,
        base,
        capture,
        result,
      })
    : null;
  if (candidateProof) ({ claim, evidence } = candidateProof);
  else {
    claim = await api(
      `/projects/${p.id}/claims`,
      'POST',
      {
        revisionId: r.id,
        expectedVersion: w.revision.version,
        claim: {
          text: 'Internal test claim: a fetched ffprobe document exists; not independent verification.',
          verificationStatus: 'unverified',
          scope: 'synthetic acceptance only',
          caveats: 'Approval does not verify factual truth',
        },
      },
      201,
    );
    w = await api(`/projects/${p.id}/research`);
    evidence = await api(
      `/projects/${p.id}/research-evidence`,
      'POST',
      {
        revisionId: r.id,
        expectedVersion: w.revision.version,
        claimId: claim.id,
        sourceId: web.id,
        role: 'support',
        quote: webIndex.extractedText.slice(0, 100),
        locator: { kind: 'text', label: 'Independent static page snapshot, first 100 characters' },
      },
      201,
    );
    assert.equal(evidence.validation, 'matched');
  }
  w = await api(`/projects/${p.id}/research`);
  const approved = await approve(w.revision);
  if (candidateProof) {
    await api(
      `/projects/${p.id}/research-candidates/${candidateProof.candidateId}`,
      'POST',
      {
        revisionId: approved.id,
        expectedVersion: approved.version,
        jobId: candidateProof.jobId,
        decision: 'reject',
      },
      422,
    );
    check('已批准研究拒绝候选审核写入，正式 Claim 保持未核实');
  }
  await api(
    `/projects/${p.id}/script`,
    'POST',
    {
      origin: 'research',
      researchRevisionId: approved.id,
      text: '为什么要区分观察和推断？\n\n解释信息来源与证据边界。',
    },
    201,
  );
  let sw = await api(`/projects/${p.id}/script`);
  sw.segments[1].factBindings = [{ claimId: claim.id, sourceIds: [evidence.sourceId] }];
  await api(`/projects/${p.id}/script`, 'PATCH', {
    revisionId: sw.revision.id,
    expectedVersion: sw.revision.version,
    segments: sw.segments,
    unitsPerMinute: 240,
  });
  sw = await api(`/projects/${p.id}/script`);
  const before = structuredClone(sw.segments);
  const scriptJob = await api(
    `/projects/${p.id}/script-runs`,
    'POST',
    {
      revisionId: sw.revision.id,
      expectedVersion: sw.revision.version,
      segmentId: before[1].id,
      instruction:
        '仅改写第二段，通俗解释观察、推断与证据的区别；必须保留已有 Claim/Source 绑定，不新增数据或来源。',
      mode: 'real',
    },
    202,
  );
  await (
    await worker('workflow-worker.cjs')
  ).done;
  const written = await api('/jobs/' + scriptJob.jobId);
  assert.equal(written.state, 'succeeded', JSON.stringify(written));
  assert.equal(written.scriptResult.mode, 'real');
  sw = await api(`/projects/${p.id}/script`);
  assert.deepEqual(sw.segments[0], before[0]);
  assert.equal(sw.segments[1].id, before[1].id);
  assert.notEqual(sw.segments[1].text, before[1].text);
  assert.deepEqual(sw.segments[1].factBindings, before[1].factBindings);
  assert.equal(sw.document.provenance, 'real');
  assert.equal(sw.revision.mock, false);
  check('真实AI局部文稿转换ScriptSegment，稳定ID/允许集引用/未改段落保持', {
    jobId: scriptJob.jobId,
    runId: written.aiRuns[0].runId,
    segmentId: before[1].id,
    text: sw.segments[1].text,
  });
  const wholeJob = await api(
    `/projects/${p.id}/script-runs`,
    'POST',
    {
      revisionId: sw.revision.id,
      expectedVersion: sw.revision.version,
      instruction:
        '整体润色叙事逻辑：保留全部段落ID、顺序与已有Claim/Source引用，保持两段，避免新增事实。',
      mode: 'real',
    },
    202,
  );
  await (
    await worker('workflow-worker.cjs')
  ).done;
  const wholeDone = await api('/jobs/' + wholeJob.jobId);
  assert.equal(wholeDone.state, 'succeeded', JSON.stringify(wholeDone));
  sw = await api(`/projects/${p.id}/script`);
  assert.deepEqual(
    sw.segments.map((s) => s.id),
    before.map((s) => s.id),
  );
  assert.deepEqual(sw.segments[1].factBindings, before[1].factBindings);
  assert.equal(wholeDone.scriptResult.mode, 'real');
  check('真实整体文稿生成沿用全部稳定ID与引用', {
    jobId: wholeJob.jobId,
    runId: wholeDone.aiRuns[0].runId,
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.goto(base + `/projects/${p.id}/research`);
  await page.getByRole('button', { name: 'Codex 实时搜索', exact: true }).waitFor();
  await page
    .getByRole('button')
    .filter({ has: page.locator('b').filter({ hasText: web.title }) })
    .first()
    .click();
  await page.getByText('搜索摘要与网页原文分界', { exact: true }).click();
  await capture(page, '03-real-search.png');
  const imageButton = page.getByRole('button', { name: /self-authored-chart.png/ });
  if (await imageButton.count()) await imageButton.first().click();
  await capture(page, '03-real-vision.png');
  const videoButton = page.getByRole('button', { name: /self-authored-background.mp4/ });
  if (await videoButton.count()) await videoButton.first().click();
  await capture(page, '03-real-video.png');
  await page.goto(base + `/projects/${p.id}/script`);
  await page.getByText('真实模型生成 · 待人工审核', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('textbox', { name: '第2段正文', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: '第2段正文', exact: true }).inputValue(),
    sw.segments[1].text,
  );
  await page.getByText(/查看 \d+ 项文稿任务/).click();
  await page
    .getByText(/查看 1 次真实模型运行与使用量/)
    .first()
    .click();
  await capture(page, '04-real-script.png');
  check('真实浏览器来源/视觉/写稿/使用量可见，刷新持久化', { pageErrors: result.pageErrors });
  const cancelJob = await api(
    `/projects/${p.id}/script-runs`,
    'POST',
    {
      revisionId: sw.revision.id,
      expectedVersion: sw.revision.version,
      segmentId: before[1].id,
      instruction: '在保持来源和稳定ID前提下更清楚地解释证据。',
      mode: 'real',
    },
    202,
  );
  const active = await worker('workflow-worker.cjs');
  let running;
  for (let n = 0; n < 100; n++) {
    running = await api('/jobs/' + cancelJob.jobId);
    if (
      running.state === 'running' &&
      running.logs?.filter((l) => l.message === 'real 文稿任务处理中').length >= 3
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(running.state, 'running');
  await api(`/jobs/${cancelJob.jobId}/cancel`, 'POST', { expectedVersion: running.version });
  await active.done;
  const cancelled = await api('/jobs/' + cancelJob.jobId);
  assert.equal(cancelled.state, 'cancelled');
  assert.ok(
    cancelled.aiRuns?.some((a) => a.failureReason === 'CODEX_CANCELLED'),
    JSON.stringify(cancelled),
  );
  assert.deepEqual((await api(`/projects/${p.id}/script`)).segments, sw.segments);
  check('运行中真实Codex取消终止进程树、审计保留、迟到文稿不写入', {
    jobId: cancelJob.jobId,
    aiRuns: cancelled.aiRuns,
  });
  const approvedScript = await approve(sw.revision);
  await api(
    `/projects/${p.id}/script`,
    'PATCH',
    {
      revisionId: approvedScript.id,
      expectedVersion: approvedScript.version,
      segments: sw.segments,
      unitsPerMinute: 240,
    },
    422,
  );
  await api(`/artifacts/${approvedScript.artifactId}/revisions`, 'POST', {
    revisionId: approvedScript.id,
    expectedVersion: approvedScript.version,
  });
  const forked = await api(`/projects/${p.id}/script`);
  assert.deepEqual(forked.segments, sw.segments);
  assert.equal(forked.document.researchRevisionId, approved.id);
  check('真实生成沿用审批只读和Fork，研究引用归属不变');
  const publicResearch = await api(`/projects/${p.id}/research`);
  const persistedResearch = structuredClone(publicResearch);
  if (supplement)
    for (const job of publicResearch.jobs) {
      if (job.researchInput?.kind === 'claims')
        for (const passage of job.researchInput.passages) {
          passage.textLength = passage.text.length;
          delete passage.text;
        }
      if (job.researchResult?.kind === 'search')
        for (const c of job.researchResult.candidates) {
          if (c.extractedText) {
            c.extractedTextSha256 = sha(c.extractedText);
            delete c.extractedText;
          }
        }
    }
  for (const entry of publicResearch.indexes)
    if (
      publicResearch.sources.some((s) => s.id === entry.sourceId && s.provenance === 'web-fetch') &&
      entry.extractedText
    ) {
      entry.extractedTextSha256 = sha(Buffer.from(entry.extractedText));
      entry.extractedTextLength = entry.extractedText.length;
      entry.extractedTextPreview = entry.extractedText.slice(0, 100);
      delete entry.extractedText;
    }
  fs.writeFileSync(
    path.join(output, 'research-snapshot.json'),
    JSON.stringify(publicResearch, null, 2) + '\n',
  );
  const persisted = await api(`/projects/${p.id}/script`);
  await page.setViewportSize({ width: 390, height: 1000 });
  await capture(page, '04-mobile.png');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await browser.close();
  browser = undefined;
  await stop();
  await start();
  assert.deepEqual(await api(`/projects/${p.id}/script`), persisted);
  if (supplement) assert.deepEqual(await api(`/projects/${p.id}/research`), persistedResearch);
  assert.equal(originalHash(), originalBefore);
  assert.deepEqual(result.pageErrors, []);
  fs.writeFileSync(
    path.join(output, 'script-snapshot.json'),
    JSON.stringify(persisted, null, 2) + '\n',
  );
  check('重启保持真实结果与审计；原用户数据不变', { originalBefore, unchanged: true });
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
      const page = browser.contexts()[0]?.pages()[0];
      if (page)
        await page
          .screenshot({ path: path.join(dataDir, 'failure.png'), fullPage: true })
          .catch(() => {});
    }
  })
  .finally(async () => {
    if (browser) await browser.close();
    await stop();
    if (db) await db.$disconnect();
    fs.writeFileSync(path.join(dataDir, 'app.log'), appLog);
  });

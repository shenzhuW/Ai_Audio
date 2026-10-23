// Final acceptance evidence only. No app changes, network stubs, reset or DROP.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { workflowAcceptance } from '../../tests/workflow/http.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'docs/phase-01-evidence');
const appDir = join(root, 'apps/web');
const require = createRequire(join(appDir, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const credentials = JSON.parse(
  readFileSync(join(root, '.cache/postgres-phase005/connection.json')),
);
assert.equal(credentials.host, '127.0.0.1');
assert.equal(credentials.port, 55432);
assert.equal(credentials.appUser, 'studio_app');
const runId = Date.now().toString(36);
const database = `studio_phase01_final_${runId}`;
const cache = join(root, '.cache/phase01-final', runId);
mkdirSync(cache, { recursive: true });
const url = (name, admin = false) =>
  `postgresql://${admin ? credentials.adminUser : credentials.appUser}:${admin ? credentials.adminPassword : credentials.appPassword}@127.0.0.1:55432/${name}?schema=public`;
const safe = (s) =>
  String(s)
    .replaceAll(credentials.adminPassword, '[REDACTED]')
    .replaceAll(credentials.appPassword, '[REDACTED]');
const evidence = {
  status: 'RUNNING',
  startedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  database,
  backend: 'real-postgresql',
  port: 3005,
  checks: [],
  screenshots: [],
  browserErrors: [],
};
function save() {
  writeFileSync(join(output, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
}
function record(name, detail) {
  evidence.checks.push({ name, status: 'PASS', detail });
  save();
  console.log('PASS ' + name);
}
function command(args, env) {
  const r = spawnSync(process.execPath, args, {
    cwd: appDir,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
  });
  const text = safe((r.stdout || '') + (r.stderr || ''));
  assert.equal(r.status, 0, text.slice(-3500));
  return text;
}
function protectedHash() {
  const h = createHash('sha256');
  function visit(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, e.name);
      if (e.isDirectory()) visit(path);
      else {
        h.update(path);
        h.update(readFileSync(path));
      }
    }
  }
  visit(join(appDir, '.data'));
  visit(join(root, '.cache/acceptance-data'));
  return h.digest('hex');
}
const originalHash = protectedHash();
let app, db, browser;
let appLog = '';
const base = 'http://127.0.0.1:3005';
const postgresEnv = { DATABASE_URL: url(database), STUDIO_DATA_DIR: join(cache, 'postgresql') };
async function startApp(env) {
  await new Promise((ok, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(3005, '127.0.0.1', () => probe.close(ok));
  });
  appLog = '';
  app = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3005'],
    {
      cwd: appDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  app.stdout.on('data', (x) => {
    appLog += safe(x);
  });
  app.stderr.on('data', (x) => {
    appLog += safe(x);
  });
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error(appLog.slice(-2000));
    try {
      if ((await fetch(base + '/projects/new')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('App readiness timeout');
}
async function stopApp() {
  if (app && app.exitCode === null) {
    const stopped = new Promise((r) => app.once('exit', r));
    app.kill();
    await stopped;
  }
  app = undefined;
}
async function capture(page, file, label) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(output, file), fullPage: true });
  evidence.screenshots.push({
    file,
    label,
    at: new Date().toISOString(),
    url: page.url(),
    sha256: createHash('sha256')
      .update(readFileSync(join(output, file)))
      .digest('hex'),
  });
  save();
}
async function browserAcceptance() {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROMIUM_PATH
      ? { executablePath: process.env.STUDIO_CHROMIUM_PATH }
      : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  context.on('page', (p) => p.on('pageerror', (e) => evidence.browserErrors.push(e.message)));
  const page = await context.newPage();
  async function api(path, method = 'GET', body, expected = 200, key = randomUUID()) {
    const r = await context.request.fetch(base + '/api/v1' + path, {
      method,
      headers: { Origin: base, 'Idempotency-Key': key },
      ...(body === undefined ? {} : { data: body }),
    });
    const data = await r.json();
    assert.equal(r.status(), expected, JSON.stringify(data));
    return data.data ?? data.error;
  }
  const projectInput = (title) => ({
    title,
    prompt: '最终验收专用测试资料，未核实，不是用户数据。',
    targetDurationMs: 120000,
    width: 1080,
    height: 1920,
    entryType: 'topic',
    voiceMode: 'tts',
    budgetLimit: { currency: 'CNY', amount: 50 },
  });
  const rp = (r) => `/artifacts/${r.artifactId}/revisions/${r.id}`;
  async function approve(r) {
    r = await api(rp(r) + '/submit', 'POST', { expectedVersion: r.version });
    return api(rp(r) + '/approve', 'POST', { expectedVersion: r.version });
  }
  try {
    await page.goto(base + '/projects/new');
    await page.locator('[name=title]').fill('Phase 01 最终验收：手动修订');
    await page
      .locator('[name=prompt]')
      .fill('最终验收专用项目，测试保存、审核与版本冲突；内容未核实。');
    await page.getByRole('button', { name: '创建并保存项目', exact: true }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectUrl = page.url(),
      projectId = projectUrl.split('/').at(-1);
    await page.goto(projectUrl + '/research');
    const editor = page.getByRole('textbox', { name: '产物文本', exact: true });
    const waitText = async (p, text) =>
      p.waitForFunction(
        (t) => document.querySelector('textarea[aria-label="产物文本"]')?.value === t,
        text,
      );
    const notice = (text) => page.getByRole('status').filter({ hasText: text }).waitFor();
    await editor.fill('研究 v1：手动输入，尚未核实。');
    await page.getByRole('button', { name: '创建草稿', exact: true }).click();
    await notice('草稿已保存');
    await page.reload();
    await waitText(page, '研究 v1：手动输入，尚未核实。');
    assert.equal(await editor.isEditable(), true);
    await capture(page, '01-draft.png', '草稿保存并刷新恢复；手动内容标未核实');

    const second = await context.newPage();
    await second.goto(projectUrl + '/research');
    await waitText(second, '研究 v1：手动输入，尚未核实。');
    await second
      .getByRole('textbox', { name: '产物文本', exact: true })
      .fill('客户端 B 已保存的新正文，仍未核实。');
    await second.getByRole('button', { name: '保存草稿', exact: true }).click();
    await second.getByRole('status').filter({ hasText: '草稿已保存' }).waitFor();
    await editor.fill('客户端 A 未保存的编辑缓冲区，应当保留。');
    const conflictResponse = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/revisions/'),
    );
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    const conflict = await conflictResponse;
    assert.equal(conflict.status(), 409);
    await page.getByRole('alert').filter({ hasText: '重新载入' }).waitFor();
    assert.equal(await editor.inputValue(), '客户端 A 未保存的编辑缓冲区，应当保留。');
    await capture(
      page,
      '02-conflict-409.png',
      '两个真实浏览器标签页：旧并发版本保存返回 409，保留本地编辑并提示重载',
    );
    record('浏览器版本冲突与缓冲保护', {
      status: conflict.status(),
      error: (await conflict.json()).error,
      bufferPreserved: true,
    });
    await page.getByRole('button', { name: '重新载入（放弃本地修改）', exact: true }).click();
    await waitText(page, '客户端 B 已保存的新正文，仍未核实。');
    await second.close();
    await page.reload();
    await waitText(page, '客户端 B 已保存的新正文，仍未核实。');
    await page.getByRole('button', { name: '提交审核', exact: true }).click();
    await page.getByRole('button', { name: '批准当前修订', exact: true }).waitFor();
    assert.equal(await editor.isEditable(), false);
    await capture(page, '03-submitted.png', '提交后待审核，只读并出现批准/驳回与审核意见');
    await page.getByRole('button', { name: '批准当前修订', exact: true }).click();
    await notice('当前修订已批准');
    await page.reload();
    await page.getByRole('button', { name: /v1 · 已批准/ }).waitFor();
    assert.equal(await editor.isEditable(), false);
    assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).count(), 0);
    await capture(
      page,
      '04-approved-readonly.png',
      '批准版只读，仅可创建新修订，真实下游任务已排队',
    );
    const snapshot = await api(`/projects/${projectId}/workflow`);
    const approvedResearch = snapshot.revisions.find((r) => r.status === 'approved');
    const immutable = await api(
      rp(approvedResearch),
      'PATCH',
      { expectedVersion: approvedResearch.version, text: '不应写入' },
      422,
    );
    assert.equal(immutable.code, 'IMMUTABLE_REVISION');
    assert.deepEqual(await api(rp(approvedResearch)), approvedResearch);
    await page.getByRole('button', { name: '创建新修订', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('textarea[aria-label="产物文本"]')?.readOnly,
    );
    const forked = (await api(`/projects/${projectId}/workflow`)).revisions.find(
      (r) => r.parentRevisionId === approvedResearch.id,
    );
    assert.ok(forked);
    assert.notEqual(forked.id, approvedResearch.id);
    assert.equal(forked.revisionNumber, 2);
    await capture(
      page,
      '05-fork-new-revision.png',
      '批准后修改必须 fork 为 v2 草稿，新 UUID、旧批准版保留',
    );
    record('批准修订不可 PATCH，fork 新身份', {
      approvedRevisionId: approvedResearch.id,
      approvedVersion: approvedResearch.version,
      patchStatus: 422,
      error: immutable.code,
      forkRevisionId: forked.id,
      forkRevisionNumber: forked.revisionNumber,
    });
    await editor.fill('研究 v2：需补充可核实依据，准备驳回。');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await notice('草稿已保存');
    await page.getByRole('button', { name: '提交审核', exact: true }).click();
    await page.locator('[name=reviewComment]').fill('请补充来源依据；保留 v1 批准历史。');
    await page.getByRole('button', { name: '驳回修改', exact: true }).click();
    await notice('修订已驳回');
    await page.reload();
    await page.getByRole('button', { name: /v2 · 已驳回/ }).waitFor();
    assert.equal(await editor.isEditable(), false);
    await capture(page, '06-rejected.png', '驳回及意见刷新后仍在；驳回版不能原地编辑');
    await page.getByRole('button', { name: /v1 · 已批准/ }).click();
    assert.equal(await editor.inputValue(), approvedResearch.text);
    assert.equal(await editor.isEditable(), false);
    await capture(page, '07-approved-history.png', '查看旧批准版，正文、状态、审核历史保持');
    record('草稿/提交/批准/驳回/历史与刷新', { projectId, oldApprovedUnchanged: true });

    let script = await api(
      `/projects/${projectId}/artifacts`,
      'POST',
      {
        type: 'script',
        text: '文稿 v1：固定引用研究批准版 v1，未核实。',
        inputRevisionIds: [approvedResearch.id],
      },
      201,
    );
    script = await approve(script);
    await page.getByRole('button', { name: '创建新修订', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('textarea[aria-label="产物文本"]')?.readOnly,
    );
    await editor.fill('研究 v3：新的批准依据，仍不表示事实核实。');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await notice('草稿已保存');
    await page.getByRole('button', { name: '提交审核', exact: true }).click();
    await page.getByRole('button', { name: '批准当前修订', exact: true }).click();
    await notice('当前修订已批准');
    const changed = await api(`/projects/${projectId}/workflow`);
    assert.ok(changed.staleRevisionIds.includes(script.id));
    assert.equal((await api(rp(script))).status, 'approved');
    assert.deepEqual(await api(rp(approvedResearch)), approvedResearch);
    await page.goto(projectUrl + '/script');
    await waitText(page, script.text);
    await page.getByText('上游批准版本已变化。', { exact: false }).waitFor();
    assert.equal(await editor.isEditable(), false);
    await capture(
      page,
      '08-dependency-stale.png',
      '上游批准新版后，下游显示依赖失效，旧 approved 事实保持',
    );
    record('真实依赖失效与批准历史保护', {
      upstreamOld: approvedResearch.id,
      upstreamNew: changed.artifacts.find((a) => a.type === 'research').approvedRevisionId,
      downstream: script.id,
      stale: true,
      historicalStatus: 'approved',
    });
    await page.goto(projectUrl);
    await page.getByRole('heading', { name: '审核与依赖', exact: true }).waitFor();
    await capture(
      page,
      '09-overview-dependencies.png',
      '总览显示真实阶段、依赖失效、版本与持久任务',
    );
    const overviewBefore = await api(`/projects/${projectId}/workflow`);
    await page.reload();
    await page.getByRole('heading', { name: '审核与依赖', exact: true }).waitFor();
    assert.deepEqual(await api(`/projects/${projectId}/workflow`), overviewBefore);
    record('总览刷新与持久任务恢复', {
      jobs: overviewBefore.jobs.length,
      staleRevisionIds: overviewBefore.staleRevisionIds,
    });

    const race = await api('/projects', 'POST', projectInput('Phase 01 最终验收：并发/幂等'), 201);
    let older = await api(
      `/projects/${race.id}/artifacts`,
      'POST',
      { type: 'research', text: '候选旧版本', inputRevisionIds: [] },
      201,
    );
    older = await api(rp(older) + '/submit', 'POST', { expectedVersion: older.version });
    let newer = await api(`/artifacts/${older.artifactId}/revisions`, 'POST', {
      revisionId: older.id,
      expectedVersion: older.version,
    });
    newer = await api(rp(newer) + '/submit', 'POST', { expectedVersion: newer.version });
    const key = randomUUID();
    const body = { expectedVersion: newer.version, comment: '最终验收并发批准' };
    const [lost, won] = await Promise.all([
      api(rp(older) + '/approve', 'POST', { expectedVersion: older.version }, 409),
      api(rp(newer) + '/approve', 'POST', body, 200, key),
    ]);
    const replays = await Promise.all([
      api(rp(newer) + '/approve', 'POST', body, 200, key),
      api(rp(newer) + '/approve', 'POST', body, 200, key),
    ]);
    for (const replay of replays) assert.deepEqual(replay, won);
    const wrongKey = await api(
      rp(newer) + '/approve',
      'POST',
      { ...body, comment: '相同 key 不同内容' },
      409,
      key,
    );
    const raced = await api(`/projects/${race.id}/workflow`);
    assert.equal(raced.jobs.length, 1);
    assert.equal(raced.approvals.filter((a) => a.action === 'approve').length, 1);
    record('并发审批 409 与幂等重放单任务', {
      projectId: race.id,
      concurrentStatuses: [409, 200],
      losingCode: lost.code,
      approvedRevisionId: won.id,
      replayStatuses: [200, 200],
      identicalResponses: true,
      changedBodyStatus: 409,
      changedBodyCode: wrongKey.code,
      downstreamJobIds: raced.jobs.map((j) => j.id),
      approvalEvents: 1,
    });

    const mockProject = await api(
      '/projects',
      'POST',
      projectInput('Phase 01 最终验收：Mock 来源保留'),
      201,
    );
    await page.goto(`${base}/projects/${mockProject.id}/research`);
    await page.getByRole('button', { name: '生成模拟研究文本', exact: true }).click();
    await notice('模拟任务已排队');
    await capture(page, '10-mock-job-queued.png', '真实 jobId 已排队，尚无文本产物');
    command([join(root, 'scripts/workflow-worker.cjs'), '--once'], postgresEnv);
    await page.getByText('Mock · 未核实', { exact: true }).waitFor();
    let mockSnapshot = await api(`/projects/${mockProject.id}/workflow`);
    const mockJob = mockSnapshot.jobs[0];
    assert.equal(mockJob.state, 'succeeded');
    let mockRevision = mockSnapshot.revisions.find((r) => r.id === mockJob.resultRevisionId);
    assert.equal(mockRevision.mock, true);
    assert.equal(mockRevision.status, 'draft');
    await capture(
      page,
      '11-mock-draft.png',
      '独立 Worker 生成带 mock=true 的未核实草稿，无自动批准',
    );
    await editor.fill('用户修改后的模拟内容，来源仍为 Mock，未核实。');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await notice('草稿已保存');
    await page.getByRole('button', { name: '创建新修订', exact: true }).click();
    await page.getByRole('button', { name: /v2 · 草稿 · Mock/ }).waitFor();
    mockSnapshot = await api(`/projects/${mockProject.id}/workflow`);
    assert.ok(mockSnapshot.revisions.every((r) => r.mock));
    await capture(page, '12-mock-edited-fork.png', '编辑和 fork 后仍保留 Mock 来源标签');
    record('Mock 标识、独立 Worker 与来源继承', {
      projectId: mockProject.id,
      jobId: mockJob.id,
      jobState: mockJob.state,
      revisionIds: mockSnapshot.revisions.map((r) => r.id),
      mockPreserved: true,
    });
    const providerProject = await api(
      '/projects',
      'POST',
      projectInput('Phase 01 最终验收：独立提供方失败'),
      201,
    );
    const providerScript = await api(
      `/projects/${providerProject.id}/artifacts`,
      'POST',
      {
        type: 'script',
        text: '独立文稿，无失效上游，用于提供方未配置验收。',
        inputRevisionIds: [],
      },
      201,
    );
    await approve(providerScript);
    command([join(root, 'scripts/workflow-worker.cjs'), '--once'], postgresEnv);
    const providerSnapshot = await api(`/projects/${providerProject.id}/workflow`);
    const providerJob = providerSnapshot.jobs.find((j) => j.kind === 'voice');
    assert.equal(providerJob.state, 'failed');
    assert.equal(providerJob.errorCode, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(providerJob.resultRevisionId, null);
    record('提供方未配置真实失败', {
      projectId: providerProject.id,
      jobId: providerJob.id,
      state: providerJob.state,
      errorCode: providerJob.errorCode,
      resultRevisionId: null,
    });
    await page.goto(`${base}/projects/${providerProject.id}`);
    await page.getByText('该阶段的提供方尚未接通，未生成音频或视频。', { exact: true }).waitFor();
    await capture(page, '13-provider-unconfigured.png', '实际未配置配音任务失败，不伪造媒体结果');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/projects/${mockProject.id}/research`);
    await page.getByRole('button', { name: /v2 · 草稿 · Mock/ }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(
      await page.getByRole('button', { name: '提交审核', exact: true }).isVisible(),
      true,
    );
    await capture(page, '14-mobile-390.png', '390px 窄屏折叠、审核按钮与 Mock 标签可用');
    record('真实审核页面响应式与浏览器错误', {
      viewport: '390x844',
      noHorizontalOverflow: true,
      pageErrors: evidence.browserErrors,
    });
    assert.deepEqual(evidence.browserErrors, []);
    return { projectId, mockProjectId: mockProject.id };
  } catch (e) {
    await page.screenshot({ path: join(cache, 'browser-failure.png'), fullPage: true });
    throw e;
  } finally {
    await browser.close();
    browser = undefined;
  }
}

try {
  const admin = new PrismaClient({ datasources: { db: { url: url('postgres', true) } } });
  try {
    const version = await admin.$queryRawUnsafe('SELECT version() AS version');
    assert.match(version[0].version, /^PostgreSQL 17\.6/);
    assert.match(database, /^studio_phase01_final_[a-z0-9]+$/);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" OWNER studio_app`);
    record('隔离 PostgreSQL 新测试库', { version: version[0].version, database });
  } finally {
    await admin.$disconnect();
  }
  const prismaCli = require.resolve('prisma/build/index.js');
  const migrationLogs = [];
  for (let i = 0; i < 2; i++)
    migrationLogs.push(command([prismaCli, 'migrate', 'deploy'], postgresEnv));
  migrationLogs.push(
    command(
      [
        prismaCli,
        'migrate',
        'diff',
        '--from-schema-datasource',
        'prisma/schema.prisma',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      postgresEnv,
    ),
  );
  writeFileSync(join(output, 'migrations.log'), migrationLogs.join('\n'));
  db = new PrismaClient({ datasources: { db: { url: url(database) } } });
  const roles = await db.$queryRawUnsafe(
    'SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname=current_user',
  );
  assert.equal(roles[0].rolsuper, false);
  assert.equal(roles[0].rolcreatedb, false);
  record('迁移重复执行、零漂移和应用最小数据库角色', roles[0]);
  await startApp(postgresEnv);
  await workflowAcceptance(base, 'postgresql', output);
  record('现有工作流 HTTP 在真实 PostgreSQL 复跑', { checks: 8 });
  const projectIds = await browserAcceptance();
  const approved = (
    await db.$queryRawUnsafe(
      "SELECT id, document FROM workflow_revisions WHERE document->>'status'='approved' ORDER BY id LIMIT 1",
    )
  )[0];
  let guarded = false;
  try {
    await db.$executeRawUnsafe(
      "UPDATE workflow_revisions SET document=jsonb_set(document,'{text}','\"illegal\"') WHERE id=$1::uuid",
      approved.id,
    );
  } catch (e) {
    guarded = /immutable/.test(e.message);
  }
  assert.ok(guarded);
  assert.deepEqual(
    (
      await db.$queryRawUnsafe(
        'SELECT document FROM workflow_revisions WHERE id=$1::uuid',
        approved.id,
      )
    )[0].document,
    approved.document,
  );
  const event = (await db.$queryRawUnsafe('SELECT id FROM workflow_approval_events LIMIT 1'))[0];
  let appendOnly = false;
  try {
    await db.$executeRawUnsafe('DELETE FROM workflow_approval_events WHERE id=$1::uuid', event.id);
  } catch (e) {
    appendOnly = /immutable/.test(e.message);
  }
  assert.ok(appendOnly);
  record('PostgreSQL 直接 SQL 不可变保护', {
    revisionId: approved.id,
    updateRejected: guarded,
    approvalDeleteRejected: appendOnly,
    documentUnchanged: true,
  });
  async function snapshots() {
    return Promise.all(
      Object.values(projectIds).map(async (id) => {
        const p = await fetch(base + '/projects/new');
        const cookie = p.headers.get('set-cookie').split(';')[0];
        const r = await fetch(`${base}/api/v1/projects/${id}/workflow`, {
          headers: { Cookie: cookie },
        });
        assert.equal(r.status, 200);
        return (await r.json()).data;
      }),
    );
  }
  const before = await snapshots();
  await stopApp();
  await startApp(postgresEnv);
  assert.deepEqual(await snapshots(), before);
  record('应用进程重启后审核/依赖/任务历史保持一致', projectIds);
  await stopApp();
  await startApp({ DATABASE_URL: '', STUDIO_DATA_DIR: join(cache, 'sqlite') });
  await workflowAcceptance(base, 'sqlite', output);
  record('现有工作流 HTTP 在独立 SQLite 复跑', { checks: 8 });
  assert.equal(protectedHash(), originalHash);
  record('原项目数据库、上传原件和会话目录未改变', { unchanged: true, sha256: originalHash });
  evidence.status = 'PASS';
  evidence.finishedAt = new Date().toISOString();
  save();
} catch (e) {
  evidence.status = 'FAIL';
  evidence.error = safe(e.stack || e);
  save();
  console.error(safe(e.stack || e));
  process.exitCode = 1;
} finally {
  await stopApp();
  if (browser) await browser.close();
  if (db) await db.$disconnect();
  writeFileSync(join(cache, 'app.log'), appLog);
}

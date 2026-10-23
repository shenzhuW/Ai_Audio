// Final acceptance only. Existing projects are read-only; fault injection uses a new SQLite store.
require('../../scripts/register-typescript.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..'),
  appDir = path.join(root, 'apps/web');
const req = createRequire(path.join(appDir, 'package.json'));
const backend = process.argv.includes('--postgres') ? 'postgresql' : 'sqlite';
const failure = process.argv.includes('--failure-retry');
assert.ok(!failure || backend === 'sqlite');
const folder = path.join(root, 'docs/evidence/phase045/remote');
const saved = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/evidence/phase045', backend, 'results.json'), 'utf8'),
);
assert.equal(saved.status, 'PASS');
assert.match(saved.runId, /^[a-z0-9]+$/);
const env = {
  ...process.env,
  DATABASE_URL: '',
  STUDIO_CODEX_ENABLED: '1',
  STUDIO_DATA_DIR: path.join(
    root,
    failure ? '.cache/phase045-remote' : '.cache/phase045',
    failure ? Date.now().toString(36) : saved.runId,
  ),
};
fs.mkdirSync(env.STUDIO_DATA_DIR, { recursive: true });
if (backend === 'postgresql') {
  const c = JSON.parse(
    fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json'), 'utf8'),
  );
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 55432);
  assert.match(saved.database, /^studio_phase045_[a-z0-9]+$/);
  const u = new URL('postgresql://127.0.0.1:55432/' + saved.database + '?schema=public');
  u.username = c.appUser;
  u.password = c.appPassword;
  env.DATABASE_URL = u.href;
}
const base = 'http://127.0.0.1:3014';
const sha = (x) =>
  createHash('sha256')
    .update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x))
    .digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const record = {
  status: 'RUNNING',
  at: new Date().toISOString(),
  backend,
  mode: failure
    ? 'real-native-CLI-killed-and-retried'
    : 'actual-database-app-restart-and-recorded-real-response-fences',
  checks: [],
};
let app, cookie, browser, worker;
async function stop() {
  if (app && app.exitCode === null) {
    const done = new Promise((r) => app.once('exit', r));
    app.kill();
    await done;
  }
  app = null;
}
async function start() {
  await new Promise((resolve, reject) => {
    const s = require('node:net').createServer();
    s.once('error', reject);
    s.listen(3014, '127.0.0.1', () => s.close(resolve));
  });
  app = spawn(
    process.execPath,
    [req.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3014'],
    { cwd: appDir, env, windowsHide: true, stdio: 'ignore' },
  );
  for (let n = 0; n < 120; n++) {
    assert.equal(app.exitCode, null, 'Application exited before readiness');
    try {
      const r = await fetch(base + '/projects');
      if (r.ok) {
        cookie = r.headers.get('set-cookie').split(';')[0];
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw Error('READINESS_TIMEOUT');
}
async function api(p, method = 'GET', body, status = 200) {
  const r = await fetch(base + '/api/v1' + p, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  assert.equal(r.status, status, JSON.stringify(value));
  return value.data;
}
function check(name, detail) {
  record.checks.push({ name, status: 'PASS', detail });
  console.log('PASS ' + backend + ': ' + name);
}
async function runWorker() {
  worker = spawn(process.execPath, [path.join(root, 'scripts/workflow-worker.cjs'), '--once'], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  worker.stdout.on('data', (b) => (log += b));
  worker.stderr.on('data', (b) => (log += b));
  const done = new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('close', (code) => {
      fs.appendFileSync(path.join(folder, 'failure-retry-worker.log'), log);
      code === 0 ? resolve() : reject(Error('WORKER_EXIT_' + code));
    });
  });
  return { pid: worker.pid, done };
}
async function main() {
  await start();
  if (failure) {
    const project = await api(
      '/projects',
      'POST',
      {
        title: 'Synthetic Phase045 native failure acceptance',
        prompt: '观察与推断需要区分。\n\n没有证据时应保留不确定性。',
        entryType: 'script',
        voiceMode: 'none',
        targetDurationMs: 30000,
        width: 1080,
        height: 1920,
        budgetLimit: { currency: 'CNY', amount: 50 },
      },
      201,
    );
    record.projectId = project.id;
    let sw = await api(`/projects/${project.id}/script`);
    if (!sw.revision) {
      await api(
        `/projects/${project.id}/script`,
        'POST',
        { origin: 'user_provided', text: '观察与推断需要区分。\n\n没有证据时应保留不确定性。' },
        201,
      );
      sw = await api(`/projects/${project.id}/script`);
    }
    const before = structuredClone(sw.segments);
    const job = await api(
      `/projects/${project.id}/script-runs`,
      'POST',
      {
        revisionId: sw.revision.id,
        expectedVersion: sw.revision.version,
        instruction: '保持全部ID和引用，简短润色已有两段，不新增事实。',
        mode: 'real',
      },
      202,
    );
    const active = await runWorker();
    let killed;
    for (let n = 0; n < 80 && !killed; n++) {
      const text = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `@(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${active.pid}' | Where-Object { $_.Name -eq 'codex.exe' -and $_.CommandLine -like '*--output-schema*' } | Select-Object ProcessId) | ConvertTo-Json -Compress`,
        ],
        { encoding: 'utf8', timeout: 10000, windowsHide: true },
      ).trim();
      const value = text ? JSON.parse(text) : [],
        xs = Array.isArray(value) ? value : [value];
      if (xs.length) {
        assert.equal(xs.length, 1);
        killed = xs[0].ProcessId;
        assert.ok(Number.isInteger(killed) && killed > 0);
        // Kill only the CLI process tree of this exact test worker, never the worker or other sessions.
        execFileSync('taskkill', ['/PID', String(killed), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } else await sleep(250);
    }
    assert.ok(killed, 'Native CLI child must actually be observed and killed');
    await active.done;
    worker = null;
    let failed = await api('/jobs/' + job.jobId);
    assert.equal(failed.state, 'failed');
    assert.equal(failed.errorCode, 'CODEX_PROCESS_FAILED');
    assert.equal(failed.leaseOwner, null);
    assert.equal(failed.leaseExpiresAt, null);
    assert.equal(failed.scriptResult, undefined);
    assert.deepEqual((await api(`/projects/${project.id}/script`)).segments, before);
    check('Actual native CLI abnormal exit releases lease and writes no partial script', {
      jobId: job.jobId,
      attempt: failed.attempt,
      errorCode: failed.errorCode,
      audit: failed.aiRuns,
    });
    await api(`/jobs/${job.jobId}/retry`, 'POST', { expectedVersion: failed.version });
    await (
      await runWorker()
    ).done;
    worker = null;
    const done = await api('/jobs/' + job.jobId);
    assert.equal(done.state, 'succeeded');
    assert.equal(done.attempt, 2);
    assert.equal(done.errorCode, null);
    assert.equal(done.scriptResult.mode, 'real');
    assert.equal(done.leaseOwner, null);
    assert.deepEqual(
      done.scriptResult.segments.map((s) => s.id),
      before.map((s) => s.id),
    );
    check('Retry of same failed job completes with actual model output and fenced attempt 2', {
      jobId: done.id,
      attempts: done.attempts,
      aiRuns: done.aiRuns,
    });
    const after = await api(`/projects/${project.id}/script`);
    await stop();
    await start();
    assert.deepEqual(await api(`/projects/${project.id}/script`), after);
    check('Retried real script survives application restart', { snapshotSha256: sha(after) });
  } else {
    const prefix = `/projects/${saved.projectId}`;
    const before = {
      research: await api(prefix + '/research'),
      script: await api(prefix + '/script'),
    };
    await stop();
    await start();
    const after = {
      research: await api(prefix + '/research'),
      script: await api(prefix + '/script'),
    };
    assert.deepEqual(after, before);
    check(
      'Full Research + Script + Source + index + evidence + AI audits unchanged after app restart',
      {
        projectId: saved.projectId,
        beforeSha256: sha(before),
        afterSha256: sha(after),
        sources: after.research.sources.length,
        indexes: after.research.indexes.length,
        evidence: after.research.evidence.length,
        researchRevisionId: after.script.document.researchRevisionId,
      },
    );
    const { openWorkflowRepository } = require('../../apps/web/src/server/workflow/repository.ts');
    const repo = await openWorkflowRepository(
      env.DATABASE_URL || 'file:' + path.join(env.STUDIO_DATA_DIR, 'studio.db'),
    );
    try {
      const { state } = await repo.transaction(saved.projectId, 'local-user');
      const { finishResearch } = require('../../apps/web/src/server/research/engine.ts');
      const { finishScript } = require('../../apps/web/src/server/script/engine.ts');
      for (const provider of ['research', 'script']) {
        const job = state.jobs.find(
          (j) =>
            j.provider === provider &&
            j.state === 'succeeded' &&
            (j.researchInput?.mode || j.scriptInput?.mode) === 'real',
        );
        assert.ok(job);
        const copy = structuredClone(state),
          input = job.researchInput || job.scriptInput;
        assert.equal(copy.revisions.find((r) => r.id === input.revisionId).status, 'approved');
        const digest = sha(copy);
        const result =
          provider === 'research'
            ? finishResearch(copy, input, job.researchResult, new Date().toISOString())
            : finishScript(copy, input, job.scriptResult);
        assert.equal(result, 'TARGET_CHANGED');
        assert.equal(sha(copy), digest);
        check(
          'Approved ' +
            provider +
            ' rejects replay of its recorded real AI response without any content mutation',
          {
            mode: 'recorded-real-response-replay-not-new-model-call',
            jobId: job.id,
            result,
            beforeSha256: digest,
            afterSha256: sha(copy),
          },
        );
      }
    } finally {
      await repo.close();
    }
    browser = await req('playwright').chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
    await page.goto(base + prefix + '/script');
    await page.getByRole('textbox', { name: '第2段正文', exact: true }).waitFor();
    await page.getByText(/查看 \d+ 项文稿任务/).click();
    const screenshots = [];
    for (const kind of ['whole', 'partial']) {
      const job = after.script.jobs.find(
        (j) =>
          j.state === 'succeeded' &&
          j.scriptInput?.mode === 'real' &&
          Boolean(j.scriptInput.segmentId) === (kind === 'partial'),
      );
      const row = page
        .locator('div')
        .filter({ has: page.locator('> p').filter({ hasText: job.id }) })
        .filter({ has: page.locator('> b', { hasText: 'Codex 真实写作' }) });
      assert.equal(await row.count(), 1);
      const summary = row.getByText(/查看 1 次真实模型运行与使用量/);
      await summary.click();
      const file = backend + '-04-real-' + kind + '.png';
      const bytes = await row.screenshot({ path: path.join(folder, file) });
      screenshots.push({
        file,
        jobId: job.id,
        sha256: sha(bytes),
        bytes: bytes.length,
        scope:
          'Actual saved job card and run audit. Current editor contains final whole-script output; earlier partial text is in the persisted job result.',
      });
      await summary.click();
    }
    check('Separate actual whole-writing and partial-rewrite job screenshots', screenshots);
  }
  record.status = 'PASS';
}
main()
  .catch((e) => {
    record.status = 'FAIL';
    record.error = e.message;
    process.exitCode = 1;
    console.error(e.message);
  })
  .finally(async () => {
    if (worker && worker.exitCode === null) worker.kill();
    if (browser) await browser.close();
    await stop();
    record.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      path.join(folder, failure ? 'failure-retry.json' : backend + '-restart-fences.json'),
      JSON.stringify(record, null, 2) + '\n',
    );
  });

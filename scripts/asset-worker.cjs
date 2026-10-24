// Reuses durable Workflow Jobs/Outbox; fixed parsers run in a credential-filtered subprocess.
require('./register-typescript.cjs');
const { spawn, spawnSync } = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { workflow } = require('../apps/web/src/server/workflow/index.ts');
const { config } = require('../apps/web/src/server/config.ts');
const { AssetResultSchema } = require('../apps/web/src/domain/assets.ts');
const { AiRunSchema } = require('../apps/web/src/domain/ai.ts');
const { isolatedEnvironment } = require('./render-worker.cjs');
const root = path.resolve(__dirname, '..');
let stopping = false,
  cancelActive = () => {};
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    cancelActive();
  });
async function execute(service, projectId, queued) {
  const workerId = randomUUID(),
    send = (command) => service.execute(projectId, 'local-user', command, randomUUID());
  const job = await send({ action: 'claim', jobId: queued.id, workerId });
  if (job.state !== 'running') return;
  let child,
    heartbeat,
    timeout,
    killTimer,
    pending = Promise.resolve(),
    fenced = false,
    timedOut = false,
    latest = '启动独立素材处理器',
    progress = 0,
    aiRuns = [],
    auditRecorded = false;
  const abort = () => {
    if (!child || child.exitCode !== null) return;
    if (child.connected) child.send('cancel', () => {});
    killTimer ??= setTimeout(() => {
      if (child.exitCode !== null) return;
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      else child.kill('SIGKILL');
    }, 5000);
  };
  cancelActive = abort;
  try {
    const dir = path.join(config().dataDir, 'asset-work', job.id, 'attempt-' + job.attempt);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.mkdirSync(dir);
    const limit = (key, fallback, max) => {
      const value = Number(process.env[key] || fallback);
      if (!Number.isInteger(value) || value < 1 || value > max)
        throw Error('ASSET_LIMIT_CONFIGURATION');
      return value;
    };
    fs.writeFileSync(
      path.join(dir, 'input.json'),
      JSON.stringify({
        input: job.assetInput,
        dataDir: config().dataDir,
      }),
      { flag: 'wx' },
    );
    const env = isolatedEnvironment();
    if (job.assetInput?.analysis === 'real') {
      Object.assign(env, require('./codex-runtime.cjs').safeEnvironment());
      if (process.env.STUDIO_CODEX_ENABLED === '1') env.STUDIO_CODEX_ENABLED = '1';
      if (process.env.STUDIO_CODEX_BINARY)
        env.STUDIO_CODEX_BINARY = process.env.STUDIO_CODEX_BINARY;
    }
    for (const name of ['STUDIO_ASSET_MAX_MB', 'STUDIO_ASSET_MAX_SECONDS'])
      if (process.env[name]) env[name] = process.env[name];
    if (process.env.STUDIO_FFMPEG_PATH) env.STUDIO_FFMPEG_PATH = process.env.STUDIO_FFMPEG_PATH;
    child = spawn(
      process.execPath,
      ['--max-old-space-size=512', path.join(root, 'scripts/asset-child.cjs'), dir],
      {
        cwd: path.join(root, 'apps/web'),
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    const exited = new Promise((ok) => {
      child.once('error', (e) => ok({ error: e }));
      child.once('exit', (code) => ok({ code }));
    });
    let output = '';
    const append = (bytes) => {
      output = (output + String(bytes)).slice(-5000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('message', (message) => {
      if (Array.isArray(message?.aiRuns)) {
        const parsed = AiRunSchema.array().max(10).safeParse(message.aiRuns);
        if (parsed.success)
          aiRuns = [...aiRuns, ...parsed.data]
            .filter(
              (r, i, x) =>
                x.findIndex((v) => v.runId === r.runId && v.startedAt === r.startedAt) === i,
            )
            .slice(-10);
      }
      if (typeof message?.message === 'string') latest = message.message.slice(0, 1500);
      if (Number.isFinite(message?.progress))
        progress = Math.max(progress, Math.min(0.99, message.progress));
    });
    const beat = () =>
      (pending = pending
        .then(async () => {
          if (!fenced)
            await send({ action: 'heartbeat', jobId: job.id, workerId, progress, message: latest });
        })
        .catch(() => {
          fenced = true;
          abort();
        }));
    await beat();
    heartbeat = setInterval(beat, 2000);
    const timeoutMs = Number(process.env.STUDIO_ASSET_JOB_TIMEOUT_MS || 600000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000)
      throw Error('ASSET_LIMIT_CONFIGURATION');
    timeout = setTimeout(() => {
      timedOut = true;
      latest = 'ASSET_TIMEOUT';
      fenced = true;
      abort();
    }, timeoutMs);
    const exit = await exited;
    clearInterval(heartbeat);
    clearTimeout(timeout);
    clearTimeout(killTimer);
    await pending;
    fs.writeFileSync(path.join(dir, 'process.log'), output.replaceAll(root, '[repo]'));
    if (exit.error) throw exit.error;
    if (fenced || stopping) throw Error(timedOut ? 'ASSET_TIMEOUT' : 'ASSET_INTERRUPTED');
    if (exit.code !== 0) {
      const code = output.trim().split(/\r?\n/).at(-1);
      throw Error(/^[A-Z_]{3,80}$/.test(code) ? code : 'ASSET_PROCESS_FAILED');
    }
    if (fs.statSync(path.join(dir, 'result.json')).size > 2 * 1024 * 1024)
      throw Error('ASSET_RESULT_LIMIT');
    const result = AssetResultSchema.parse(
      JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')),
    );
    await send({
      action: 'heartbeat',
      jobId: job.id,
      workerId,
      progress: 0.95,
      message: '提取结果已校验；正在校验固定导演及逐镜绑定版本。',
    });
    const done = await send({ action: 'finish', jobId: job.id, workerId, assetResult: result });
    auditRecorded = true;
    console.log(`Asset job ${job.id}: ${done.state}${done.errorCode ? ' ' + done.errorCode : ''}`);
  } catch (e) {
    clearInterval(heartbeat);
    await pending;
    const errorCode = /^[A-Z_]{3,80}$/.test(e.message) ? e.message : 'ASSET_PROCESS_FAILED';
    try {
      await send({ action: 'heartbeat', jobId: job.id, workerId, progress, message: errorCode });
      await send({
        action: 'finish',
        jobId: job.id,
        workerId,
        errorCode,
        ...(aiRuns.length ? { aiRuns } : {}),
      });
      auditRecorded = true;
    } catch {
      /* Cancelled/expired owner cannot write. */
    }
    console.error(`Asset attempt ${job.id}: ${errorCode}`);
  } finally {
    if (!auditRecorded && aiRuns.length) {
      try {
        await send({
          action: 'record-ai-run',
          jobId: job.id,
          workerId,
          attempt: job.attempt,
          aiRuns,
        });
      } catch {
        /* New attempt owns its audit. */
      }
    }
    clearInterval(heartbeat);
    clearTimeout(timeout);
    clearTimeout(killTimer);
    cancelActive = () => {};
  }
}
(async () => {
  const service = await workflow(),
    repo = await globalThis.studioWorkflow;
  do {
    for (const projectId of await repo.workProjects()) {
      const snapshot = await service.read(projectId, 'local-user');
      for (const job of snapshot.jobs.filter((j) => j.provider === 'asset')) {
        if (stopping) break;
        try {
          if (job.state === 'running' && Date.parse(job.leaseExpiresAt) <= Date.now())
            await service.execute(
              projectId,
              'local-user',
              { action: 'recover', jobId: job.id },
              randomUUID(),
            );
          else if (job.state === 'queued') await execute(service, projectId, job);
        } catch (e) {
          if (!['JOB_CONFLICT', 'REVISION_CONFLICT'].includes(e.code))
            console.error('Asset queue error: ' + (e.code || e.name));
        }
      }
    }
    if (process.argv.includes('--once')) break;
    if (!stopping) await new Promise((r) => setTimeout(r, 1000));
  } while (!stopping);
  await repo.close();
  process.exit(0);
})().catch((e) => {
  console.error('Asset worker stopped: ' + (e.code || e.name));
  process.exit(1);
});

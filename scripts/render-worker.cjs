// Trusted coordinator only. Rendering happens in a credential-free child, never in Next.
const { spawn, spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const { mkdirSync, writeFileSync, readFileSync, statSync } = require('node:fs');
const { randomUUID, createHash } = require('node:crypto');
const root = resolve(__dirname, '..');
const allowed = [
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'COMSPEC',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'STUDIO_CHROMIUM_PATH',
  'STUDIO_FFPROBE_PATH',
];
function isolatedEnvironment(parent = process.env) {
  const env = { NODE_ENV: 'production' };
  for (const name of allowed) if (parent[name]) env[name] = parent[name];
  return env;
}
module.exports = { isolatedEnvironment };
if (require.main === module) {
  require('./register-typescript.cjs');
  const { workflow } = require('../apps/web/src/server/workflow/index.ts');
  const { config } = require('../apps/web/src/server/config.ts');
  const { RenderResultSchema, verifyVideoMetadata } = require('../apps/web/src/domain/motion.ts');
  let stopping = false,
    cancelActive = () => {};
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      stopping = true;
      cancelActive();
    });
  const log = (text) =>
    String(text)
      .replaceAll(root, '[repo]')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database]')
      .slice(-1800);
  async function executeJob(service, projectId, queued) {
    const token = randomUUID(); // New fencing identity for every attempt, including retries.
    const exec = (command) => service.execute(projectId, 'local-user', command, randomUUID());
    const job = await exec({ action: 'claim', jobId: queued.id, workerId: token });
    if (job.state !== 'running') return;
    let timer,
      child,
      pending = Promise.resolve(),
      fenced = false,
      progress = 0,
      latest = '启动可信渲染子进程';
    let forcedKill;
    function abort() {
      if (!child || child.exitCode !== null) return;
      if (child.connected) child.send('cancel', () => {});
      forcedKill ??= setTimeout(() => {
        if (child.exitCode !== null) return;
        // Kill only the child tree created by this coordinator, never a discovered/global PID.
        if (process.platform === 'win32')
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        else child.kill('SIGKILL');
      }, 5000);
    }
    cancelActive = abort;
    try {
      if (process.env.STUDIO_TRUSTED_LOCAL_RENDER !== '1')
        throw new Error('TRUSTED_LOCAL_RENDER_NOT_ENABLED');
      const parent = join(config().dataDir, 'renders', job.id);
      mkdirSync(parent, { recursive: true });
      const output = join(parent, 'attempt-' + job.attempt);
      mkdirSync(output); // Existing attempt files are never overwritten.
      if (job.renderInput.preparedBackground) {
        const bg = job.renderInput.preparedBackground,
          snap = await (await globalThis.studioWorkflow).transaction(projectId, 'local-user'),
          b = snap.state.assetBindings.find((b) => b.id === bg.bindingId),
          p = snap.state.preparedAssets.find((p) => p.recipeHash === bg.recipeHash);
        if (!b || !p || p.blob.sha256 !== bg.sha256) throw Error('ASSET_RENDER_INVALID');
        const bytes = await require('../apps/web/src/server/assets/storage.ts')
          .assetStore(config().dataDir)
          .read(p.blob);
        const publicDir = join(output, 'public');
        mkdirSync(publicDir);
        writeFileSync(join(publicDir, 'background.mp4'), bytes, { flag: 'wx' });
        writeFileSync(
          join(publicDir, 'NotoSansSC-subset.woff2'),
          readFileSync(join(root, 'apps/render/public/NotoSansSC-subset.woff2')),
          { flag: 'wx' },
        );
      }
      writeFileSync(join(output, 'input.json'), JSON.stringify(job.renderInput), { flag: 'wx' });
      child = spawn(
        process.execPath,
        ['--max-old-space-size=1024', join(root, 'scripts/render-child.cjs'), output],
        {
          cwd: join(root, 'apps/render'),
          env: isolatedEnvironment(),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
      );
      // Observe exit before awaiting any database heartbeat (even immediate spawn failures).
      const exited = new Promise((ok) => {
        child.once('error', (error) => ok({ error }));
        child.once('exit', (code) => ok({ code }));
      });
      let processLog = '';
      const append = (bytes) => {
        processLog = (processLog + log(bytes)).slice(-16000);
      };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.on('message', (message) => {
        if (typeof message?.message === 'string') latest = log(message.message);
        if (Number.isFinite(message?.progress))
          progress = Math.min(0.99, Math.max(progress, message.progress));
      });
      const beat = () => {
        pending = pending
          .then(async () => {
            if (fenced) return;
            await exec({
              action: 'heartbeat',
              jobId: job.id,
              workerId: token,
              progress,
              message: latest,
            });
          })
          .catch(() => {
            fenced = true;
            abort();
          });
        return pending;
      };
      await beat();
      timer = setInterval(beat, 2000);
      const timeout = setTimeout(() => {
        latest = 'RENDER_TIMEOUT (600 seconds)';
        fenced = true;
        abort();
      }, 600000);
      let exit;
      try {
        const ended = await exited;
        if (ended.error) throw ended.error;
        exit = ended.code;
      } finally {
        clearTimeout(timeout);
        clearTimeout(forcedKill);
        clearInterval(timer);
        await pending;
      }
      writeFileSync(join(output, 'process.log'), processLog);
      if (fenced || stopping)
        throw new Error(latest.includes('TIMEOUT') ? 'RENDER_TIMEOUT' : 'RENDER_INTERRUPTED');
      if (exit !== 0) throw new Error('RENDER_PROCESS_FAILED: ' + processLog.slice(-1400));
      const result = RenderResultSchema.parse(
        JSON.parse(readFileSync(join(output, 'result.json'), 'utf8')),
      );
      for (const a of result.artifacts) {
        const file = join(output, a.file);
        if (
          statSync(file).size > 100 * 1024 * 1024 ||
          statSync(file).size !== a.sizeBytes ||
          createHash('sha256').update(readFileSync(file)).digest('hex') !== a.sha256
        )
          throw new Error('ARTIFACT_HASH_MISMATCH');
      }
      verifyVideoMetadata(JSON.parse(readFileSync(join(output, 'ffprobe.json'), 'utf8')));
      await exec({ action: 'finish', jobId: job.id, workerId: token, renderResult: result });
      console.log('PASS real render ' + job.id);
    } catch (e) {
      clearInterval(timer);
      await pending;
      const error = log(e.message || e);
      try {
        await exec({
          action: 'heartbeat',
          jobId: job.id,
          workerId: token,
          progress,
          message: error,
        });
        await exec({
          action: 'finish',
          jobId: job.id,
          workerId: token,
          errorCode: error.split(/[: (]/)[0].slice(0, 80),
        });
      } catch {
        /* Cancelled/expired attempts cannot commit; restart recovers expired leases. */
      }
      console.error('Render attempt ended: ' + error.split(':')[0]);
    } finally {
      clearInterval(timer);
      clearTimeout(forcedKill);
      cancelActive = () => {};
    }
  }
  (async () => {
    const service = await workflow();
    const repo = await globalThis.studioWorkflow;
    do {
      for (const projectId of await repo.workProjects()) {
        const snapshot = await service.read(projectId, 'local-user');
        for (const job of snapshot.jobs.filter((j) => j.provider === 'remotion')) {
          if (stopping) break;
          if (job.state === 'running' && Date.parse(job.leaseExpiresAt) <= Date.now()) {
            await service.execute(
              projectId,
              'local-user',
              { action: 'recover', jobId: job.id },
              randomUUID(),
            );
          } else if (job.state === 'queued') {
            try {
              await executeJob(service, projectId, job);
            } catch (e) {
              if (e.code !== 'JOB_CONFLICT' && e.code !== 'REVISION_CONFLICT')
                console.error('Render queue error: ' + (e.code || e.name));
            }
          }
        }
      }
      if (process.argv.includes('--once')) break;
      if (!stopping) await new Promise((r) => setTimeout(r, 1000));
    } while (!stopping);
    await repo.close();
    process.exit(0);
  })().catch((e) => {
    console.error('Render worker stopped: ' + (e.code || e.name));
    process.exit(1);
  });
}

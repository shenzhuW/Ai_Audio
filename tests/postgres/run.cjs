// Real PostgreSQL only. Creates fresh, uniquely named databases; never resets or drops data.
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '../..');
const appDir = join(root, 'apps/web');
const appRequire = createRequire(join(appDir, 'package.json'));
const { PrismaClient } = appRequire('@prisma/client');
const verifyRepository = require('./repository.cjs');
const creds = JSON.parse(readFileSync(join(root, '.cache/postgres-phase005/connection.json')));
assert.equal(creds.host, '127.0.0.1');
assert.equal(creds.port, 55432);
assert.equal(creds.appUser, 'studio_app');
assert.match(creds.appPassword, /^[A-F0-9]{48}$/);
const runId = Date.now().toString(36);
const database = `studio_phase005_${runId}`;
const freshDatabase = `${database}_fresh`;
const dataDir = join(root, '.cache/phase005-runs', runId);
const evidenceDir = join(root, 'docs/evidence/phase00-5');
mkdirSync(dataDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
const url = (name, admin = false) =>
  `postgresql://${admin ? creds.adminUser : creds.appUser}:${admin ? creds.adminPassword : creds.appPassword}@127.0.0.1:55432/${name}?schema=public`;
const safe = (text) =>
  String(text)
    .replaceAll(creds.adminPassword, '[REDACTED]')
    .replaceAll(creds.appPassword, '[REDACTED]');
const evidence = {
  status: 'RUNNING',
  at: new Date().toISOString(),
  database,
  host: '127.0.0.1',
  port: 55432,
  backend: 'real-postgresql',
  checks: [],
};
const record = (name, detail) => {
  evidence.checks.push({ name, status: 'PASS', detail });
  writeFileSync(join(evidenceDir, 'postgres-results.json'), JSON.stringify(evidence, null, 2));
  console.log(`PASS ${name}`);
};
const prismaCli = appRequire.resolve('prisma/build/index.js');
function command(exe, args, env = {}, cwd = appDir, options = {}) {
  const r = spawnSync(exe, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    ...options,
  });
  const output = safe((r.stdout || '') + (r.stderr || ''));
  assert.equal(r.status, 0, `${args[0]} failed: ${output.slice(-3500)}`);
  return output;
}
function migrate(name) {
  const output = command(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    DATABASE_URL: url(name),
  });
  return output;
}
function protectedDataHash() {
  const hash = createHash('sha256');
  function visit(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(dir, e.name);
      if (e.isDirectory()) visit(file);
      else {
        hash.update(file);
        hash.update(readFileSync(file));
      }
    }
  }
  visit(join(root, 'apps/web/.data'));
  visit(join(root, '.cache/acceptance-data'));
  return hash.digest('hex');
}
const originalHash = protectedDataHash();
let app, db;
let appLog = '';
const base = 'http://127.0.0.1:3003';
const appEnv = { DATABASE_URL: url(database), STUDIO_DATA_DIR: dataDir, PORT: '3003' };
async function startApp() {
  app = spawn(
    process.execPath,
    [
      appRequire.resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3003',
    ],
    {
      cwd: appDir,
      env: { ...process.env, ...appEnv },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  app.stdout.on('data', (x) => {
    appLog += safe(x);
  });
  app.stderr.on('data', (x) => {
    appLog += safe(x);
  });
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error(`App exited: ${appLog.slice(-1500)}`);
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
async function getSnapshots(ids) {
  const page = await fetch(base + '/projects/new');
  const cookie = page.headers.get('set-cookie').split(';')[0];
  return Promise.all(
    ids.map(async (id) => {
      const r = await fetch(base + '/api/v1/projects/' + id, { headers: { Cookie: cookie } });
      assert.equal(r.status, 200);
      return (await r.json()).data;
    }),
  );
}
async function run() {
  // Fail early if the dedicated app port belongs to another process.
  const net = require('node:net');
  await new Promise((ok, fail) => {
    const probe = net.createServer();
    probe.once('error', fail);
    probe.listen(3003, '127.0.0.1', () => probe.close(ok));
  });
  const admin = new PrismaClient({ datasources: { db: { url: url('postgres', true) } } });
  try {
    const version = await admin.$queryRawUnsafe('SELECT version() AS version');
    assert.match(version[0].version, /^PostgreSQL 17\.6/);
    record('真实 PostgreSQL 服务器版本', version[0].version);
    const roles = await admin.$queryRawUnsafe(
      'SELECT rolname FROM pg_roles WHERE rolname=$1',
      creds.appUser,
    );
    if (roles.length === 0)
      await admin.$executeRawUnsafe(`CREATE ROLE studio_app LOGIN PASSWORD '${creds.appPassword}'`);
    for (const name of [database, freshDatabase]) {
      assert.match(name, /^studio_phase005_[a-z0-9_]+$/);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" OWNER studio_app`);
    }
  } finally {
    await admin.$disconnect();
  }
  writeFileSync(
    join(dataDir, '.env.postgres'),
    `DATABASE_URL=${url(database)}\nSTUDIO_DATA_DIR=${dataDir.replaceAll('\\', '/')}\n`,
  );
  const firstMigration = migrate(database);
  assert.match(firstMigration, /0001_project/);
  assert.match(migrate(database), /No pending migrations/);
  assert.match(migrate(freshDatabase), /0001_project/);
  record('原迁移首次部署、重复执行与第二空库初始化', { migration: '0001_project', freshDatabase });
  command(process.execPath, [prismaCli, 'migrate', 'status'], { DATABASE_URL: url(database) });
  command(
    process.execPath,
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
    { DATABASE_URL: url(database) },
  );
  record('实际 PostgreSQL 与 Prisma schema 一致', { drift: false });
  db = new PrismaClient({ datasources: { db: { url: url(database) } } });
  const role = await db.$queryRawUnsafe(
    'SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname=current_user',
  );
  assert.equal(role[0].rolsuper, false);
  assert.equal(role[0].rolcreatedb, false);
  record('应用使用非超级用户、无建库权限', role[0]);
  record('九组合、时长、并发锁、重连及 SQLite 协议对照', await verifyRepository(url(database)));
  await startApp();
  command(process.execPath, [join(root, 'tests/http/run.mjs')], {
    ...appEnv,
    STUDIO_TEST_URL: base,
    STUDIO_TEST_BACKEND: 'postgresql',
    STUDIO_TEST_EVIDENCE_DIR: evidenceDir,
  });
  const http = JSON.parse(readFileSync(join(evidenceDir, 'http-results.json')));
  assert.equal(http.checks.length, 15);
  const before = await getSnapshots(http.projectIds);
  for (const p of before)
    assert.deepEqual((await db.project.findUnique({ where: { id: p.id } })).document, p);
  record('15 项 HTTP 验收且返回数据逐项对应 PostgreSQL 行', { projectIds: http.projectIds });
  const attachment = before[2].input.attachments[0];
  const blob = readFileSync(join(dataDir, 'blobs', attachment.id));
  assert.equal(createHash('sha256').update(blob).digest('hex'), attachment.sha256);
  record('上传原件与 PostgreSQL 附件元数据 SHA256 一致', { bytes: blob.length });
  await stopApp();
  await startApp();
  assert.deepEqual(await getSnapshots(http.projectIds), before);
  record('应用进程重启后项目与设置持久化', { projects: before.length });
  await stopApp();
  await db.$disconnect();
  const pgBin = process.env.STUDIO_POSTGRES_BIN || join(root, '.tools/postgresql-17.6/pgsql/bin');
  const cluster = join(root, '.cache/postgres-phase005/cluster');
  // The server may inherit captured pipe handles on Windows; its own log is already configured.
  command(
    join(pgBin, 'pg_ctl.exe'),
    [
      '-D',
      cluster,
      '-m',
      'fast',
      '-w',
      'restart',
      '-l',
      join(root, '.cache/postgres-phase005/postgres.log'),
    ],
    {},
    appDir,
    { stdio: 'ignore' },
  );
  await startApp();
  assert.deepEqual(await getSnapshots(http.projectIds), before);
  await db.$connect();
  const restoredSession = await fetch(base + '/projects/new');
  const restoredFile = await fetch(
    base + `/api/v1/projects/${before[2].id}/uploads/${attachment.id}`,
    {
      headers: { Cookie: restoredSession.headers.get('set-cookie').split(';')[0] },
    },
  );
  assert.equal(restoredFile.status, 200);
  assert.deepEqual(Buffer.from(await restoredFile.arrayBuffer()), blob);
  const migrations = await db.$queryRawUnsafe(
    'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations',
  );
  assert.equal(migrations.length, 1);
  assert.ok(migrations[0].finished_at && !migrations[0].rolled_back_at);
  assert.match(migrate(database), /No pending migrations/);
  record('数据库与应用共同重启后持久化，原件可下载，迁移记录仍唯一', {
    migrations: 1,
    attachmentPersistent: true,
  });
  assert.equal(protectedDataHash(), originalHash);
  record('原 SQLite 数据、附件和会话文件未被修改', { unchanged: true });
  evidence.status = 'PASS';
}
run()
  .catch((e) => {
    evidence.status = 'FAIL';
    evidence.error = safe(e.stack || e);
    console.error(evidence.error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopApp();
    if (db) await db.$disconnect();
    writeFileSync(join(dataDir, 'app.log'), appLog);
    writeFileSync(join(evidenceDir, 'postgres-results.json'), JSON.stringify(evidence, null, 2));
  });

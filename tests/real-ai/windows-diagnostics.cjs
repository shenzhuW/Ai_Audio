// Inspect only the two recorded test incidents and the isolated failed SQLite run.
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..'),
  out = path.join(root, 'docs/evidence/phase045/remote');
fs.mkdirSync(out, { recursive: true });
const file = path.join(root, '.cache/phase03/mvksxxvt/studio.db');
const db = new DatabaseSync(file, { readOnly: true });
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((x) => x.name);
const jobTable = tables.find((t) => t === 'workflow_jobs');
const jobs = jobTable
  ? db
      .prepare('SELECT document FROM workflow_jobs')
      .all()
      .map((x) => JSON.parse(x.document))
  : [];
const inventory = {
  isolatedRun: 'mvksxxvt',
  readOnly: true,
  projectCount: db.prepare('SELECT count(*) AS n FROM projects').get().n,
  jobCount: jobs.length,
  runningJobs: jobs
    .filter((j) => j.state === 'running')
    .map((j) => ({ id: j.id, state: j.state, leaseExpiresAt: j.leaseExpiresAt })),
  realAiRuns: jobs.flatMap((j) => j.aiRuns || []).length,
  walRetained: fs.existsSync(file + '-wal'),
  appLogRetained: fs.existsSync(path.join(path.dirname(file), 'app.log')),
};
db.close();
let eventLog;
try {
  const text = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$records=@(Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=[datetime]'2026-10-23T17:55:00';EndTime=[datetime]'2026-10-23T18:50:00';Id=1000,1001} -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'node.exe' }); @{matchingNodeEventCount=$records.Count;records=@($records | ForEach-Object { @{eventId=$_.Id;recordId=$_.RecordId;at=$_.TimeCreated.ToUniversalTime().ToString('o')} })} | ConvertTo-Json -Depth 4 -Compress",
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 },
  );
  eventLog = { available: true, ...JSON.parse(text), rawMessagesNotPublished: true };
} catch (e) {
  eventLog = {
    available: false,
    exitCode: e.status,
    reason: 'Targeted Application event query unavailable; no error text or dump invented',
  };
}
const copies = [
  ['.cache/phase045-regression-research-sqlite.log', 'windows-regression-initial.log'],
  ['.cache/phase045-regression-research-sqlite-retry.log', 'windows-regression-sqlite-retry.log'],
  [
    '.cache/phase045-regression-research-postgres-retry.log',
    'windows-regression-postgresql-retry.log',
  ],
];
for (const [from, to] of copies) fs.copyFileSync(path.join(root, from), path.join(out, to));
const record = {
  at: new Date().toISOString(),
  platform: process.platform,
  node: process.version,
  source:
    'Original command exit observations plus retained output; post-incident read-only inspection. No crash dump was captured.',
  incidents: [
    {
      name: 'phase03-regression-batch',
      exitCode: -1073740791,
      hex: '0xC0000409',
      step: 'After HTTP smoke PASS, before the next workflow group reported completion; exact native instruction/component unknown.',
      duringCodexTask: false,
      stderrOrStack: 'None captured; original stdout contains one HTTP PASS line.',
      taskAndDataInspection: inventory,
      partialData:
        'Synthetic HTTP project/upload/session and SQLite WAL remain in ignored isolated directory; not a completed regression run.',
      residualProcesses:
        'No project-owned node processes were observed in the later targeted inspection; original crashing PID was not retained, so immediate orphan absence cannot be proved retrospectively.',
      retry: {
        sqlite: '../regression/phase03/sqlite/results.json',
        postgresql: '../regression/phase03/postgresql/results.json',
        counts: [15, 16],
        status: 'PASS',
      },
    },
    {
      name: 'final-browser-recapture-batch',
      exitCode: -1073740791,
      hex: '0xC0000409',
      step: 'After SQLite capture PASS while transitioning to PostgreSQL recapture/startup; exact native instruction/component unknown.',
      duringCodexTask: false,
      stderrOrStack: 'None captured; browser-native-exit.log contains SQLite PASS only.',
      taskAndDataInspection:
        'Capture executes GETs/screenshots only; no AI worker/jobs are started. Existing successful datasets were later re-read and rechecked on both backends.',
      partialData:
        'SQLite PNGs/capture metadata retained. PostgreSQL incomplete batch not counted as PASS; independent --postgres capture replaced only its evidence.',
      residualProcesses:
        'Targeted inspection after the abnormal exit found no surviving project Next process on capture port 3013. Test data/temp directories intentionally retained.',
      retry: {
        command: 'node tests/real-ai/capture.cjs --postgres',
        log: '../browser-postgresql-retry.log',
        result: '../postgresql/captures.json',
        status: 'PASS',
      },
    },
  ],
  eventLog,
  rootCause: 'UNCONFIRMED',
  mitigations: [
    'Run each backend in an independent process; capture now checks port availability and application readiness.',
    'Keep exact failed output/exit and independent retry records; unfinished batches do not count as PASS.',
    'Worker leases, heartbeat, terminal lease cleanup and attempt fencing protect jobs; separately exercise actual CLI process termination and retry.',
  ],
  nextRecurrence: [
    'Record exact PID/parent PID, timestamps and signed/hex exit status at process close.',
    'Preserve stdout/stderr privately; query matching Application 1000/1001 metadata and fault module for that PID/time.',
    'Inspect only that isolated database read-only for leases/partial writes and enumerate descendants of that known PID.',
    'If a dump is needed, collect privately with explicit user approval: memory dumps may contain authentication or personal data and must not be committed.',
  ],
};
fs.writeFileSync(
  path.join(out, 'windows-native-incidents.json'),
  JSON.stringify(record, null, 2) + '\n',
);
console.log(
  JSON.stringify({ status: 'RECORDED_NOT_ROOT_CAUSE_RESOLVED', inventory, eventLog }, null, 2),
);

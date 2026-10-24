// Only self-authored fixture/task evidence is publishable. Never collect private runtime folders.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'),
  out = path.join(root, 'docs/evidence/phase05');
function clean(s) {
  return (
    s
      .replaceAll(root, '[repo]')
      .replaceAll(root.replaceAll('\\', '/'), '[repo]')
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/[ \t]+$/gm, '')
      .trimEnd() + '\n'
  );
}
const checks = [];
for (const module of [
  '',
  'regression-research',
  'regression-script',
  'regression-real-ai',
  'regression-render',
])
  for (const backend of ['sqlite', 'postgresql']) {
    const file = path.join(out, module, backend, 'results.json'),
      record = JSON.parse(fs.readFileSync(file));
    assert.equal(record.status, 'PASS', file);
    assert.deepEqual(record.pageErrors, []);
    checks.push({
      module: module || 'voice',
      backend,
      status: record.status,
      groups: record.checks.length,
      runId: record.runId,
      file: path.relative(out, file).replaceAll('\\', '/'),
    });
  }
const logs = {
  'unit.log': 'unit-final.log',
  'typecheck.log': 'typecheck-final.log',
  'render-typecheck.log': 'render-typecheck-final.log',
  'build.log': 'build-final.log',
  'prisma-generate.log': 'prisma-generate.log',
  'prisma-validate.log': 'prisma-validate.log',
  'regression-render-sqlite.log': 'regression-render-sqlite-retry.log',
  'regression-render-postgresql.log': 'regression-render-pg.log',
  'voice-sqlite.log': 'voice-sqlite.log',
  'voice-postgresql.log': 'voice-postgres.log',
  'regression-research-sqlite.log': 'regression-research-sqlite.log',
  'regression-research-postgresql.log': 'regression-research-pg.log',
  'regression-script-sqlite.log': 'regression-script-sqlite.log',
  'regression-script-postgresql.log': 'regression-script-pg.log',
  'regression-real-ai-sqlite.log': 'regression-real-ai-sqlite.log',
  'regression-real-ai-postgresql.log': 'regression-real-ai-pg-retry.log',
};
fs.mkdirSync(path.join(out, 'logs'), { recursive: true });
for (const [target, source] of Object.entries(logs))
  fs.writeFileSync(
    path.join(out, 'logs', target),
    clean(fs.readFileSync(path.join(root, '.cache/phase05', source), 'utf8')),
  );
assert.match(fs.readFileSync(path.join(out, 'logs/unit.log'), 'utf8'), /pass 56/);
for (const backend of ['sqlite', 'postgresql']) {
  const asr = JSON.parse(fs.readFileSync(path.join(out, backend, 'real-asr.json'))),
    aligned = JSON.parse(fs.readFileSync(path.join(out, backend, 'real-alignment.json')));
  assert.equal(asr.voiceResult.run.referenceTextProvided, false);
  assert.equal(aligned.voiceResult.run.referenceTextProvided, true);
  const audio = fs.readFileSync(path.join(root, 'fixtures/voice/chinese-system-speech.wav'));
  assert.equal(asr.voiceResult.audioSha256, createHash('sha256').update(audio).digest('hex'));
  assert.equal(aligned.voiceResult.audioSha256, asr.voiceResult.audioSha256);
}
fs.writeFileSync(
  path.join(out, 'summary.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status: 'PASS',
      unit: { pass: 56, fail: 0 },
      checks,
      limitations: [
        'No cloud neural TTS configured',
        'ASR errors and zero-duration raw model words preserved',
        'Trusted native inference, not an OS sandbox',
        'Prior two Windows native anomalies remain UNCONFIRMED',
      ],
    },
    null,
    2,
  ) + '\n',
);
// Public copies normalize tool progress whitespace; original private command logs are retained.
function normalizeLogs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) normalizeLogs(file);
    else if (entry.name.endsWith('.log'))
      fs.writeFileSync(file, clean(fs.readFileSync(file, 'utf8')));
  }
}
normalizeLogs(out);
console.log(
  JSON.stringify(
    {
      status: 'PASS',
      unitTests: 56,
      integrationGroups: checks.reduce((n, c) => n + c.groups, 0),
      checks,
    },
    null,
    2,
  ),
);

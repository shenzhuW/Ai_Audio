// Read only self-authored acceptance artifacts. No production database or authentication access.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  os = require('node:os');
const { createHash } = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'),
  out = path.join(root, 'docs/evidence/phase05/remote');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const code = '4869793eed1cbb2e448cb37bf44e47ea42715baf',
  baseline = '3e5e7268f175546fe226e893c71eeb6bb33e69b8';
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
assert.equal(git('rev-parse', code + '^'), baseline);
assert.equal(
  git(
    'diff',
    code,
    '--',
    'apps/web/src',
    'apps/web/prisma',
    'scripts/voice-native.cjs',
    'scripts/voice-speech-native.cjs',
    'scripts/voice-speech.py',
    'scripts/voice-sapi.ps1',
  ),
  '',
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixture = fs.readFileSync(path.join(root, 'fixtures/voice/chinese-system-speech.wav'));
assert.ok(
  fixture.equals(
    execFileSync('git', ['show', code + ':fixtures/voice/chinese-system-speech.wav'], {
      cwd: root,
    }),
  ),
);
const probe = JSON.parse(
  execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      'fixtures/voice/chinese-system-speech.wav',
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  ),
);
fs.writeFileSync(path.join(out, 'ffprobe.json'), JSON.stringify(probe, null, 2) + '\n');
const backends = [];
for (const backend of ['sqlite', 'postgresql']) {
  const dir = `docs/evidence/phase05/remote/voice/${backend}`,
    r = read(dir + '/results.json'),
    asr = read(dir + '/real-asr.json'),
    align = read(dir + '/real-alignment.json'),
    ai = read(dir + '/model-transcribe-io.json'),
    aligned = read(dir + '/model-align-io.json'),
    seek = read(dir + '/playback-seek.json'),
    edited = read(dir + '/edited-restart.json');
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.pageErrors, []);
  assert.ok(r.checks.every((c) => c.status === 'PASS'));
  assert.equal(ai.referenceTextProvided, false);
  assert.ok(!ai.inputKeys.includes('text'));
  assert.ok(!Object.hasOwn(ai, 'text'));
  const reference = fs.readFileSync(path.join(root, 'fixtures/voice/script.txt'), 'utf8').trim();
  assert.notEqual(asr.voiceResult.transcript, reference);
  assert.equal(ai.output.transcript, asr.voiceResult.transcript);
  assert.equal(aligned.referenceTextProvided, true);
  assert.equal(aligned.text, reference);
  assert.deepEqual(aligned.output.words, align.voiceResult.words);
  assert.equal(ai.audioSha256, sha(fixture));
  assert.equal(aligned.audioSha256, sha(fixture));
  const words = aligned.output.words,
    cues = align.voiceResult.cues,
    positive = words.filter((w) => w.endMs > w.startMs);
  assert.ok(new Set(positive.map((w) => w.endMs - w.startMs)).size > 4);
  assert.equal(cues.filter((c) => c.level === 'word').length, positive.length);
  for (const c of cues.filter((c) => c.level === 'word'))
    assert.ok(
      positive.some(
        (w) => w.text.trim() === c.text && w.startMs === c.startMs && w.endMs === c.endMs,
      ),
    );
  const positions = [];
  let cursor = 0;
  for (const w of words) {
    const text = w.text.trim(),
      start = reference.indexOf(text, cursor);
    assert.ok(start >= cursor);
    positions.push({ ...w, startChar: start, endChar: start + text.length });
    cursor = start + text.length;
  }
  const firstOccurrence = positions.filter((w) => w.startChar < 3),
    secondOccurrence = positions.filter((w) => w.startChar >= 3 && w.startChar < 6);
  assert.ok(firstOccurrence.length && secondOccurrence.length);
  assert.ok(
    firstOccurrence.every((w) => !secondOccurrence.some((x) => x.startChar === w.startChar)),
  );
  assert.equal(seek.status, 'PASS');
  assert.ok(Math.abs(seek.seeked.currentTime * 1000 - seek.targetMs) < 200);
  assert.ok(Math.abs(Number(probe.format.duration) * 1000 - seek.timelineDurationMs) <= 1);
  assert.equal(edited.status, 'PASS');
  assert.deepEqual(edited.after, edited.before);
  assert.equal(edited.after.track.cues[0].startMs, 250);
  assert.equal(edited.after.timeline.scriptRevisionId, align.voiceInput.scriptRevisionId);
  const cancel = read(dir + '/cancelled-job.json'),
    late = read(dir + '/stale-result-job.json');
  assert.equal(cancel.state, 'cancelled');
  assert.equal(cancel.leaseExpiresAt, null);
  assert.equal(late.errorCode, 'TARGET_CHANGED');
  assert.deepEqual(
    asr.voiceRuns.map((r) => r.failureReason),
    ['SPEECH_NOT_CONFIGURED', 'SPEECH_TIMEOUT', null],
  );
  const details = {
    backend,
    status: 'PASS',
    runId: r.runId,
    groups: r.checks.length,
    audioSha256: sha(fixture),
    scriptRevisionId: align.voiceInput.scriptRevisionId,
    asrRunId: asr.voiceResult.run.runId,
    alignmentRunId: align.voiceResult.run.runId,
    transcript: asr.voiceResult.transcript,
    model: align.voiceResult.model,
    modelSha256: align.voiceResult.modelSha256,
    engineVersion: align.voiceResult.engineVersion,
    modelWordCount: words.length,
    wordCueCount: positive.length,
    sentenceCueCount: cues.filter((c) => c.level === 'sentence').length,
    firstRepeatedWord: firstOccurrence,
    secondRepeatedWord: secondOccurrence,
    zeroWidth: words.filter((w) => w.startMs === w.endMs),
    seek,
    editedSubtitle: edited.after.track.cues[0],
    asrMs: asr.voiceResult.run.durationMs,
    alignmentMs: align.voiceResult.run.durationMs,
    note: '重复词/标点位置与模型原始时间可追溯；停顿、零宽词及误差不视为人工金标准。',
  };
  fs.writeFileSync(
    path.join(out, 'voice', backend, 'review-details.json'),
    JSON.stringify(details, null, 2) + '\n',
  );
  backends.push(details);
}
const old = read('docs/evidence/phase05/summary.json');
assert.equal(old.status, 'PASS');
assert.equal(old.unit.pass, 56);
for (const check of old.checks) {
  const r = read('docs/evidence/phase05/' + check.file);
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.pageErrors, []);
}
const audit = read('docs/evidence/phase05/remote/code-security-audit.json');
assert.equal(audit.commit, code);
assert.deepEqual(audit.findings, []);
const clean = (s) =>
  s
    .replaceAll(root, '[repo]')
    .replaceAll(root.replaceAll('\\', '/'), '[repo]')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[ \t]+$/gm, '')
    .trimEnd() + '\n';
for (const name of [
  'remote-unit',
  'remote-typecheck',
  'remote-build',
  'remote-voice-sqlite',
  'remote-voice-postgresql',
]) {
  const text = clean(fs.readFileSync(path.join(root, '.cache/phase05', name + '.log'), 'utf8'));
  if (name === 'remote-unit') assert.match(text, /pass 56/);
  fs.writeFileSync(path.join(out, name + '.log'), text);
}
const python = path.join(root, '.tools/speech-python/Scripts/python.exe');
const versions = JSON.parse(
  execFileSync(
    python,
    [
      '-c',
      "import importlib.metadata as m,sys,json; print(json.dumps({'python':sys.version.split()[0],'packages':{n:m.version(n) for n in ['openai-whisper','stable-ts','torch','torchaudio','numpy','numba','llvmlite']}}))",
    ],
    { encoding: 'utf8', windowsHide: true },
  ),
);
const hardware = {
  platform: os.platform(),
  arch: os.arch(),
  cpu: os.cpus()[0].model,
  logicalCpuCount: os.cpus().length,
  ramGiB: Math.round(os.totalmem() / 1024 ** 3),
  node: process.version,
  ...versions,
  inferenceDevice: 'cpu',
  torchThreads: 2,
  fp16: false,
  gpuRequired: false,
  note: '实际验收环境，非最低硬件保证；未采集主机名、用户名、序列号、IP或环境变量。',
};
fs.writeFileSync(path.join(out, 'environment.json'), JSON.stringify(hardware, null, 2) + '\n');
fs.writeFileSync(
  path.join(out, 'verification.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status: 'PASS',
      code,
      baseline,
      originalIntegrationGroups: old.checks.reduce((n, c) => n + c.groups, 0),
      newVoiceGroups: backends.reduce((n, c) => n + c.groups, 0),
      unitTests: 56,
      codeAudit: {
        files: audit.scannedFiles,
        maxFileBytes: audit.maxFileBytes,
        findings: audit.findings,
      },
      backends,
      scope:
        'Acceptance-only test/document/evidence additions; application and worker source unchanged',
      historicalWindowsNativeRisk: 'UNCONFIRMED',
    },
    null,
    2,
  ) + '\n',
);
function normalize(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) normalize(p);
    else if (d.name.endsWith('.log')) fs.writeFileSync(p, clean(fs.readFileSync(p, 'utf8')));
  }
}
normalize(out);
console.log(
  JSON.stringify(
    {
      status: 'PASS',
      unitTests: 56,
      originalGroups: 126,
      newVoiceGroups: backends.reduce((n, c) => n + c.groups, 0),
      codeAuditFiles: audit.scannedFiles,
      findings: [],
    },
    null,
    2,
  ),
);

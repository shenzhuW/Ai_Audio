// Audit immutable Git blobs. Never read Codex authentication or user data files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const code = 'ad26a25e2bc01c9a22e95c4a4076b5ea09720f25';
const baseline = '0f2fa62bf4fd9ef6cde2ff21540fed71574b8258';
const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
assert.equal(git('rev-parse', code + '^').toString().trim(), baseline);
const names = git('diff-tree', '--no-commit-id', '--name-only', '-r', '-z', code).toString().split('\0').filter(Boolean);
assert.equal(names.length, 284);
const findings = [], manifest = [], groups = new Map();
for (const file of names) {
  const bytes = git('show', code + ':' + file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const blob = git('rev-parse', code + ':' + file).toString().trim();
  manifest.push({ path: file, bytes: bytes.length, sha256, blob });
  const same = groups.get(sha256) || []; same.push(file); groups.set(sha256, same);
  if (/(^|\/)(node_modules|\.next|\.cache|\.data|\.tools|pgdata|uploads|voice-work|voice-blobs)(\/|$)|(^|\/)(auth\.json|session-key|\.pgpass)$|\.(db(?:-wal|-shm)?|sqlite3?|pem|key|pfx|p12|dump|backup|pt|onnx|exe)$/i.test(file)) findings.push({ file, rule: 'private/runtime file' });
  if (bytes.subarray(0, 16).toString() === 'SQLite format 3\0') findings.push({ file, rule: 'SQLite binary' });
  if (bytes.length > 10 * 1024 * 1024) findings.push({ file, rule: 'over 10MiB' });
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [rule, regex] of [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['provider token', /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/],
    ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
    ['authentication JSON', /"(?:access_token|refresh_token|id_token|OPENAI_API_KEY)"\s*:\s*"[^"\s]{16,}"/],
    ['signed session', /studio_session=[A-Za-z0-9_%.-]{20,}/],
  ]) if (regex.test(text)) findings.push({ file, rule });
  for (const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s/:]+:([^\s@]+)@/gi)) if (!['PASSWORD', 'CHANGE_ME', '<password>'].includes(m[1])) findings.push({ file, rule: 'database credential' });
}
const duplicateGroups = [...groups.entries()].filter(([, paths]) => paths.length > 1).map(([sha256, paths]) => ({ sha256, bytesEach: manifest.find(m => m.path === paths[0]).bytes, paths }));
const out = path.join(root, 'docs/evidence/phase06/remote'); fs.mkdirSync(out, { recursive: true });
const result = { code, baseline, scannedFiles: names.length, findings, totalBytes: manifest.reduce((n, m) => n + m.bytes, 0), maxFileBytes: Math.max(...manifest.map(m => m.bytes)), duplicateGroups, duplicatePolicy: 'Retain accepted evidence and per-backend paths. Identical blobs are deduplicated by Git; do not rewrite the accepted commit.', fixtureReview: 'Self-authored Chinese text, local Windows SAPI output; no private human recording or voice engine distribution. FFprobe and original text retained.', manifest };
fs.writeFileSync(path.join(out, 'code-security-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ code, scannedFiles: names.length, findings, maxFileBytes: result.maxFileBytes, duplicates: duplicateGroups.length }));
assert.deepEqual(findings, []);

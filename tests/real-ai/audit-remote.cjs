// Scan exact staged/committed bytes. Findings expose paths/rules only, never secrets.
const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const git = (...args) =>
  execFileSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const ref = process.argv[2] || '--staged',
  staged = ref === '--staged';
const commit = staged
  ? null
  : git('rev-parse', '--verify', ref + '^{commit}')
      .toString()
      .trim();
const output = process.argv[3] || '.cache/phase045-remote-audit.json';
const names = git(
  ...(staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['diff-tree', '--no-commit-id', '--name-only', '--diff-filter=ACMR', '-r', '-z', commit]),
)
  .toString()
  .split('\0')
  .filter(Boolean);
const findings = [],
  files = [];
for (const file of names) {
  const b = git('show', (staged ? ':' : commit + ':') + file);
  files.push({
    file,
    bytes: b.length,
    sha256: createHash('sha256').update(b).digest('hex'),
    blob: git('rev-parse', (staged ? ':' : commit + ':') + file)
      .toString()
      .trim(),
  });
  if (
    /(^|\/)(\.codex|\.data|\.cache|\.tools|node_modules|\.next|\.pnpm-store|pgdata|uploads|blobs|research-blobs|backups)(\/|$)|(^|\/)(session-key|\.pgpass|auth\.json|credentials\.json|cookies\.txt)$|\.(db(?:-wal|-shm)?|sqlite3?(?:-wal|-shm)?|dump|backup|pem|key|p12|pfx)$/.test(
      file,
    ) ||
    (/(^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.example'))
  )
    findings.push({ file, rule: 'private/local path' });
  if (
    b.subarray(0, 16).toString() === 'SQLite format 3\0' ||
    b.subarray(0, 5).toString() === 'PGDMP'
  )
    findings.push({ file, rule: 'database binary' });
  if (b.length > 10 * 1024 * 1024) findings.push({ file, rule: 'oversized outgoing file' });
  if (b.includes(0)) continue;
  const text = b.toString('utf8');
  for (const [rule, pattern] of [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    [
      'provider token',
      /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/,
    ],
    ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/],
    ['authentication JSON', /"(?:access_token|refresh_token|id_token)"\s*:\s*"[^"\s]{16,}"/],
    [
      'signed session',
      /(?:Cookie|Set-Cookie)["'\s:]+[^\n]{0,100}=[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/,
    ],
  ])
    if (pattern.test(text)) findings.push({ file, rule });
  for (const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s/:]+:([^\s@]+)@/gi))
    if (!['PASSWORD', 'CHANGE_ME', '<password>'].includes(m[1]))
      findings.push({ file, rule: 'database credential' });
}
const record = {
  at: new Date().toISOString(),
  mode: staged ? 'exact-index' : 'exact-commit',
  commit,
  scannedFiles: files.length,
  maxFileBytes: Math.max(0, ...files.map((f) => f.bytes)),
  findings,
  limitations:
    'Pattern/path/binary checks plus human fixture/evidence review; not a guarantee against every possible encoded secret.',
  files,
};
fs.mkdirSync(path.dirname(path.resolve(root, output)), { recursive: true });
fs.writeFileSync(path.resolve(root, output), JSON.stringify(record, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      mode: record.mode,
      commit,
      scannedFiles: files.length,
      maxFileBytes: record.maxFileBytes,
      findings,
    },
    null,
    2,
  ),
);
process.exitCode = findings.length ? 1 : 0;

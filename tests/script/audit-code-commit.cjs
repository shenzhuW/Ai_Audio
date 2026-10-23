// Inspect committed bytes, not working copies. Never print matching credentials.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const ref = process.argv[2] || '94189c817393e6a374b395969b66e373c9bfe1c6';
const commit = git('rev-parse', '--verify', ref + '^{commit}').toString().trim();
const output = process.argv[3] || 'docs/evidence/phase04/remote/code-commit-audit.json';
const files = git('diff-tree', '--no-commit-id', '--name-only', '--diff-filter=ACMR', '-r', '-z', commit)
  .toString().split('\0').filter(Boolean);
const findings = [], manifest = [];
for (const file of files) {
  const bytes = git('show', commit + ':' + file);
  manifest.push({ file, bytes: bytes.length, blob: git('rev-parse', commit + ':' + file).toString().trim() });
  if (/(^|\/)(\.data|\.cache|\.tools|node_modules|\.next|\.pnpm-store|research-blobs|pgdata|uploads|blobs|backups)(\/|$)|(^|\/)(session-key|\.pgpass)$|\.(db(?:-wal|-shm)?|sqlite3?(?:-wal|-shm)?|dump|backup|pem|key|p12|pfx)$/.test(file)
      || (/(^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.example')))
    findings.push({ file, rule: 'private path' });
  if (bytes.subarray(0, 16).toString() === 'SQLite format 3\0' || bytes.subarray(0, 5).toString() === 'PGDMP')
    findings.push({ file, rule: 'database binary' });
  if (bytes.length > 10 * 1024 * 1024) findings.push({ file, rule: 'large outgoing file' });
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [rule, re] of [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['provider token', /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/],
    ['signed session', /(?:Cookie|Set-Cookie)["'\s:]+[^\n]{0,100}=[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/],
  ]) if (re.test(text)) findings.push({ file, rule });
  for (const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s/:]+:([^\s@]+)@/gi))
    if (!['PASSWORD', 'CHANGE_ME', '<password>'].includes(m[1])) findings.push({ file, rule: 'database credential' });
}
fs.mkdirSync(path.dirname(path.resolve(root, output)), { recursive: true });
fs.writeFileSync(path.resolve(root, output), JSON.stringify({ at: new Date().toISOString(), commit,
  scannedFiles: files.length, maxFileBytes: Math.max(0, ...manifest.map((f) => f.bytes)), findings, files: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ commit, scannedFiles: files.length, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;

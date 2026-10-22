// Scan the exact Git index; report rule + path only, never matched credentials.
const { execFileSync } = require('node:child_process');
const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  .toString().split('\0').filter(Boolean);
const findings = [];
for (const file of files) {
  if (/(^|\/)(node_modules|\.next|\.data|\.cache|\.tools|\.pnpm-store|pgdata|backups)(\/|$)|^(uploads|blobs)\//.test(file) ||
      /(^|\/)(session-key|\.pgpass)$|\.(db(?:-wal|-shm)?|sqlite3?(?:-wal|-shm)?|pem|key|p12|pfx|dump|backup)$/.test(file) ||
      (/(^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.example')))
    findings.push({ file, rule: 'private/local file' });
  const bytes = execFileSync('git', ['show', `:${file}`], { maxBuffer: 32 * 1024 * 1024 });
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [rule, pattern] of [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['provider token', /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/],
    ['database credential', /postgres(?:ql)?:\/\/[^\s/:]+:([^\s@]+)@/gi],
  ]) {
    const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
    if (matches.some((m) => rule !== 'database credential' || !['PASSWORD', 'CHANGE_ME', '<password>'].includes(m[1])))
      findings.push({ file, rule });
  }
}
console.log(JSON.stringify({ scannedStagedFiles: files.length, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;

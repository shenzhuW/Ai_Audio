const fs = require('node:fs'),
  { execFileSync } = require('node:child_process');
const code = '50bdda5bce8e83c821ab56a20a243f6aba778d7f';
const git = (...args) =>
  execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', '-z', code)
  .toString()
  .split('\0')
  .filter(Boolean);
const findings = [],
  manifest = [];
for (const file of files) {
  const bytes = git('show', code + ':' + file),
    text = bytes.toString('utf8');
  manifest.push({
    file,
    bytes: bytes.length,
    blob: git('rev-parse', code + ':' + file)
      .toString()
      .trim(),
  });
  if (
    /(^|\/)(\.data|\.cache|node_modules|\.next|research-blobs|pgdata|uploads|blobs)(\/|$)|(^|\/)(session-key|\.pgpass)$|\.(db|sqlite3?|dump|backup|pem|key)$/.test(
      file,
    ) ||
    (/(^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.example'))
  )
    findings.push({ file, rule: 'private path' });
  if (
    bytes.subarray(0, 16).toString() === 'SQLite format 3\0' ||
    bytes.subarray(0, 5).toString() === 'PGDMP'
  )
    findings.push({ file, rule: 'database binary' });
  if (bytes.length > 10 * 1024 * 1024) findings.push({ file, rule: 'large outgoing file' });
  if (!bytes.includes(0)) {
    for (const [rule, re] of [
      ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
      [
        'token',
        /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/,
      ],
      [
        'signed session in artifact',
        /(?:Cookie|Set-Cookie)["'\s:]+[^\n]{0,100}=[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/,
      ],
    ])
      if (re.test(text)) findings.push({ file, rule });
    for (const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s/:]+:([^\s@]+)@/gi))
      if (!['PASSWORD', 'CHANGE_ME', '<password>'].includes(m[1]))
        findings.push({ file, rule: 'database credentials' });
  }
}
fs.writeFileSync(
  'docs/evidence/phase03/remote/code-commit-audit.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      commit: code,
      scannedFiles: files.length,
      maxFileBytes: Math.max(...manifest.map((f) => f.bytes)),
      findings,
      files: manifest,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ scannedFiles: files.length, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;

const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
const baseline = '881e1022ea27638bf7a3c7364c55871802c56fe5';
const names = [
  ...new Set([
    ...git('diff', '--name-only', baseline, '--diff-filter=ACMR').split(/\r?\n/),
    ...git('ls-files', '--others', '--exclude-standard').split(/\r?\n/),
  ]),
]
  .filter(Boolean)
  .sort();
const excluded = [
  'docs/evidence/phase045/manifest.json',
  'docs/evidence/phase045/verification.json',
  'docs/evidence/phase045/security-audit.json',
];
const files = names
  .filter((name) => !excluded.includes(name))
  .map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
fs.writeFileSync(
  path.join(root, 'docs/evidence/phase045/manifest.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      baseline,
      implementationHeadAtSnapshot: git('rev-parse', 'HEAD').trim(),
      pendingLocalChangesAtSnapshot: !!git('status', '--porcelain').trim(),
      snapshotScope: 'All Phase04.5 changes against approved Phase04 baseline, before materials commit; not a final clean-worktree assertion.',
      excludedSelfAndVolatileRecords: excluded,
      files,
    },
    null,
    2,
  ) + '\n',
);
const scan = execFileSync(
  process.execPath,
  [path.join(root, 'scripts/audit-staged.cjs'), '--worktree'],
  { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true },
);
fs.writeFileSync(path.join(root, 'docs/evidence/phase045/security-audit.json'), scan);
console.log(JSON.stringify({ pendingFiles: files.length, scan: JSON.parse(scan) }, null, 2));

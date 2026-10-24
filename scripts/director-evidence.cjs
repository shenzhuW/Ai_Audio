const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  base = path.join(root, 'docs/evidence/phase06'),
  target = new Map();
for (const backend of ['sqlite', 'postgresql'])
  for (const name of ['real-director-job.json', 'cancelled-director-job.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(base, backend, name)));
    for (const run of j.aiRuns || [])
      if (run.runId)
        target.set(run.runId, {
          backend,
          kind: name.startsWith('real') ? 'real' : 'cancelled',
          jobId: j.id,
          inputSha256: createHash('sha256').update(JSON.stringify(j.directorInput)).digest('hex'),
          audit: run,
        });
  }
const found = [];
for (const f of fs
  .readdirSync(os.tmpdir(), { withFileTypes: true })
  .filter((x) => x.isDirectory() && x.name.startsWith('studio-codex-data-'))) {
  const file = path.join(os.tmpdir(), f.name, 'events.jsonl');
  if (!fs.existsSync(file)) continue;
  const events = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const id = events.find((e) => e.type === 'thread.started')?.thread_id,
    entry = target.get(id);
  if (!entry) continue;
  const safe = events.filter(
    (e) =>
      ['thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'error'].includes(
        e.type,
      ) ||
      (e.type === 'item.completed' && e.item?.type === 'agent_message'),
  );
  fs.writeFileSync(
    path.join(base, entry.backend, entry.kind + '-cli-events.jsonl'),
    safe.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
  found.push({
    ...entry,
    runId: id,
    events: safe.length,
    rawEvents: events.length,
    schemaSha256: createHash('sha256')
      .update(fs.readFileSync(path.join(os.tmpdir(), f.name, 'output-schema.json')))
      .digest('hex'),
  });
}
fs.writeFileSync(
  path.join(base, 'cli-evidence.json'),
  JSON.stringify(
    {
      scope:
        'Exact matching runIds from synthetic Phase06 jobs only; no auth/config/session files read',
      found,
      unavailable: [...target.entries()]
        .filter(([id]) => !found.some((f) => f.runId === id))
        .map(([id, v]) => ({ runId: id, backend: v.backend, kind: v.kind })),
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ matched: found.length, requested: target.size }));

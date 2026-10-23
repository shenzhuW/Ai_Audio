require('./register-typescript.cjs');
const { randomUUID } = require('node:crypto');
const { workflow } = require('../apps/web/src/server/workflow/index.ts');
let stopping = false;
const controller = new AbortController();
process.on('SIGINT', () => {
  stopping = true;
  controller.abort();
});
process.on('SIGTERM', () => {
  stopping = true;
  controller.abort();
});
(async () => {
  const worker = await workflow(),
    id = randomUUID();
  do {
    const processed = await worker.tick(id, controller.signal);
    if (process.argv.includes('--once')) {
      console.log(`Workflow worker processed ${processed} job(s); provider mode recorded per job.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  } while (!stopping);
  process.exit(0);
})().catch((e) => {
  console.error('Workflow worker failed:', e.code || e.name);
  process.exit(1);
});

require('./register-typescript.cjs');
const { randomUUID } = require('node:crypto');
const { workflow } = require('../apps/web/src/server/workflow/index.ts');
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
(async () => {
  const worker = await workflow(),
    id = randomUUID();
  do {
    const processed = await worker.tick(id);
    if (process.argv.includes('--once')) {
      console.log(`Workflow worker processed ${processed} job(s); mock text only.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  } while (!stopping);
  process.exit(0);
})().catch((e) => {
  console.error('Workflow worker failed:', e.code || e.name);
  process.exit(1);
});

require('./register-typescript.cjs');
const fs = require('node:fs'),
  path = require('node:path');
const { AssetJobInputSchema, AssetResultSchema } = require('../apps/web/src/domain/assets.ts');
const { processAsset } = require('./asset-process.cjs');
const controller = new AbortController();
process.on('message', (m) => {
  if (m === 'cancel') controller.abort();
});
(async () => {
  const dir = process.argv[2],
    raw = JSON.parse(fs.readFileSync(path.join(dir, 'input.json'), 'utf8')),
    input = AssetJobInputSchema.parse(raw.input);
  const result = AssetResultSchema.parse(
    await processAsset(input, raw.dataDir, dir, controller.signal),
  );
  if (controller.signal.aborted) throw Error('ASSET_CANCELLED');
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  process.send?.({
    aiRuns: result.aiRuns,
    progress: 0.95,
    message: '真实素材结果完成，等待版本栅栏校验',
  });
})()
  .catch((e) => {
    if (e.aiRun) process.send?.({ aiRuns: [e.aiRun] });
    if (e.diagnostic) console.error(e.diagnostic);
    console.error(/^[A-Z_0-9]{3,80}$/.test(e.message) ? e.message : 'ASSET_PROCESS_FAILED');
    process.exitCode = 1;
  })
  .finally(() => process.disconnect?.());

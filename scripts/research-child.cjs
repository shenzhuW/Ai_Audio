require('./register-typescript.cjs');
const fs = require('node:fs'),
  path = require('node:path');
const { z } = require(
  require('node:module')
    .createRequire(path.resolve(__dirname, '../apps/web/package.json'))
    .resolve('zod'),
);
const {
  ResearchJobInputSchema,
  ResearchResultSchema,
} = require('../apps/web/src/domain/research.ts');
const { analyze } = require('./research-extract.cjs');
const controller = new AbortController();
process.on('message', (message) => {
  if (message === 'cancel') controller.abort();
});
(async () => {
  const dir = process.argv[2],
    raw = JSON.parse(fs.readFileSync(path.join(dir, 'input.json'), 'utf8'));
  const input = ResearchJobInputSchema.parse(raw.input);
  const limits = z
    .object({
      maxPdfPages: z.number().int().min(1).max(100),
      maxVideoSeconds: z.number().int().min(1).max(600),
    })
    .strict()
    .parse(raw.limits);
  process.send?.({
    message: '本地解析器读取冻结原件；不会执行远程页面或 AI 代码。',
    progress: 0.1,
  });
  const result = ResearchResultSchema.parse(
    await analyze(input, raw.dataDir, path.join(dir, 'frames'), limits, controller.signal),
  );
  if (controller.signal.aborted) throw Error('RESEARCH_CANCELLED');
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  if (result.aiRuns) process.send?.({ aiRuns: result.aiRuns });
  process.send?.({ message: '内容提取完成；未自动核实 Claim。', progress: 0.9 });
})()
  .catch((e) => {
    if (e.aiRuns || e.aiRun) process.send?.({ aiRuns: e.aiRuns || [e.aiRun] });
    console.error(
      e.code === 'PROVIDER_NOT_CONFIGURED'
        ? 'PROVIDER_NOT_CONFIGURED'
        : /^[A-Z_]{3,80}$/.test(e.message)
          ? e.message
          : 'RESEARCH_EXTRACTION_FAILED',
    );
    process.exitCode = 1;
  })
  .finally(() => process.disconnect?.());

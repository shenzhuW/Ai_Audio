// In-process TypeScript test loader, so validation also works in restricted runners.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/web/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(result.outputText, filename);
};
for (const name of fs
  .readdirSync(path.join(__dirname, '../tests/unit'))
  .filter((n) => n.endsWith('.test.ts')))
  require(path.join(__dirname, '../tests/unit', name));

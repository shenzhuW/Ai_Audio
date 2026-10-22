// In-process TypeScript test loader, so validation also works in restricted runners.
const fs = require('node:fs');
const path = require('node:path');
require('./register-typescript.cjs');
for (const name of fs
  .readdirSync(path.join(__dirname, '../tests/unit'))
  .filter((n) => n.endsWith('.test.ts')))
  require(path.join(__dirname, '../tests/unit', name));

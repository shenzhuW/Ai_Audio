import { test } from 'node:test';
import assert from 'node:assert/strict';
const { isolatedEnvironment } = require('../../scripts/render-worker.cjs');
test('Render child environment never inherits database, user session, token, proxy or Node injection variables', () => {
  const env = isolatedEnvironment({
    PATH: 'tools',
    SystemRoot: 'system',
    TEMP: 'tmp',
    DATABASE_URL: 'private',
    OPENAI_API_KEY: 'private',
    STUDIO_SESSION_KEY: 'private',
    GITHUB_TOKEN: 'private',
    HTTP_PROXY: 'private',
    NODE_OPTIONS: '--require injected',
    STUDIO_DATA_DIR: 'user-data',
    STUDIO_CHROMIUM_PATH: 'trusted-chrome',
  });
  assert.deepEqual(
    Object.keys(env).sort(),
    ['NODE_ENV', 'PATH', 'STUDIO_CHROMIUM_PATH', 'SystemRoot', 'TEMP'].sort(),
  );
  assert.equal(env.NODE_ENV, 'production');
});

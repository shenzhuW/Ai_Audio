import test from 'node:test';
import assert from 'node:assert/strict';
const { selectNasaVideoUrl } = require('../../scripts/asset-providers.cjs');
test('NASA video manifest selects public HTTPS MP4 rendition without arbitrary host fallback', () => {
  const root = 'http://images-assets.nasa.gov/video/test/test';
  assert.equal(
    selectNasaVideoUrl([root + '~medium.mp4', root + '~small.mp4', root + '~mobile.mp4']),
    'https://images-assets.nasa.gov/video/test/test~small.mp4',
  );
  assert.equal(
    selectNasaVideoUrl(['https://127.0.0.1/private.mp4', 'https://evil.test/a.mp4']),
    null,
  );
});

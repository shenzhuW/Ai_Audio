// Own procedural geometry, not third-party footage. Existing files are preserved.
const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { createHash } = require('node:crypto');
const root = resolve(__dirname, '..');
const output = join(root, 'apps/render/public');
mkdirSync(output, { recursive: true });
const recipe = [
  '-hide_banner',
  '-n',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x071122:s=1080x1920:r=30:d=10',
  '-vf',
  'drawgrid=w=90:h=90:t=1:c=0x345488@0.55,drawbox=x=90:y=880:w=900:h=680:color=0x102744@0.9:t=fill,rotate=0.025*sin(2*PI*t/10):fillcolor=0x071122',
  '-an',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '22',
  '-preset',
  'fast',
  '-movflags',
  '+faststart',
];
const background = join(output, 'background.mp4');
if (!existsSync(background)) {
  const result = spawnSync(process.env.STUDIO_FFMPEG_PATH || 'ffmpeg', [...recipe, background], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  if (result.status !== 0)
    throw new Error('Background generation failed: ' + result.stderr?.slice(-1000));
}
const hash = (name) =>
  createHash('sha256')
    .update(readFileSync(join(output, name)))
    .digest('hex');
const manifest = {
  schemaVersion: 1,
  backgroundSha256: hash('background.mp4'),
  fontSha256: hash('NotoSansSC-subset.woff2'),
  backgroundOrigin: 'self-generated-procedural-geometry',
  backgroundLicenseEvidence: 'apps/render/ASSET_LICENSES.md',
  fontLicense: 'SIL-OFL-1.1',
  recipe,
};
const manifestPath = join(output, 'asset-manifest.json');
const text = JSON.stringify(manifest, null, 2) + '\n';
if (
  existsSync(manifestPath) &&
  !require('node:util').isDeepStrictEqual(JSON.parse(readFileSync(manifestPath, 'utf8')), manifest)
)
  throw new Error('Existing fixture manifest differs. Inspect changes; refusing to overwrite.');
if (!existsSync(manifestPath)) writeFileSync(manifestPath, text, { flag: 'wx' });
console.log('Prepared self-generated 300-frame video and licensed local font.');

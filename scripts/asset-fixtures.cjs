// Self-authored procedural animation, no third-party audio/images or personal data.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  dir = path.join(root, 'fixtures/assets');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, 'gpu-two-scenes.mp4');
const recipe = [
  '-hide_banner',
  '-nostdin',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x122a50:s=640x360:r=30:d=6',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x175640:s=640x360:r=30:d=6',
  '-filter_complex',
  "[0:v]drawgrid=w=40:h=40:t=1:c=0x5488aa,drawbox=x=200:y=90:w=240:h=180:color=0x253a67:t=fill,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='GPU schematic - scene A':fontcolor=white:fontsize=25:x=110:y=40,rotate=0.04*sin(t):fillcolor=0x122a50[a];[1:v]drawgrid=w=80:h=40:t=2:c=0x73bf9a,drawbox=x=200:y=90:w=240:h=180:color=0x234934:t=fill,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='GPU schematic - scene B':fontcolor=white:fontsize=25:x=110:y=40,rotate=-0.04*sin(t):fillcolor=0x175640[b];[a][b]concat=n=2:v=1:a=0[out]",
  '-map',
  '[out]',
  '-an',
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '24',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
];
if (!fs.existsSync(out)) {
  const r = spawnSync(process.env.STUDIO_FFMPEG_PATH || 'ffmpeg', [...recipe, '-n', out], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (r.status !== 0) throw Error(r.stderr);
}
const sha256 = createHash('sha256').update(fs.readFileSync(out)).digest('hex');
fs.writeFileSync(
  path.join(dir, 'manifest.json'),
  JSON.stringify(
    {
      origin: 'self-generated procedural geometry',
      license: 'CC0-1.0',
      containsPersonalData: false,
      sha256,
      durationMs: 12000,
      fps: 30,
      frames: 360,
      sceneBoundaryMs: 6000,
      recipe,
    },
    null,
    2,
  ) + '\n',
);
console.log('Self-authored fixture SHA256 ' + sha256);

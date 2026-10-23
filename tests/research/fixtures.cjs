// Self-authored synthetic material. These assertions are not real-world facts.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
function pdf(text) {
  const content = `BT /F1 16 Tf 50 750 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let value = '%PDF-1.4\n',
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(value);
  value +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((x) => String(x).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(value);
}
function fixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    'source-a.pdf': pdf('SYNTHETIC TEST ONLY. Capacity is 32 units.'),
    'source-b.txt': Buffer.from(
      'SYNTHETIC TEST ONLY. Capacity is 64 units. This contradicts Source A.\n',
    ),
    'broken.pdf': Buffer.from('%PDF-1.4\nintentionally invalid synthetic parser fixture'),
  };
  for (const [name, bytes] of Object.entries(files))
    if (!fs.existsSync(path.join(dir, name)))
      fs.writeFileSync(path.join(dir, name), bytes, { flag: 'wx' });
  const image = path.join(dir, 'diagram.png');
  if (!fs.existsSync(image)) {
    const r = spawnSync(
      process.env.STUDIO_FFMPEG_PATH || 'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x195ae8:s=640x360',
        '-frames:v',
        '1',
        '-n',
        image,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (r.status !== 0) throw Error(r.stderr);
  }
  const video = path.resolve(__dirname, '../../apps/render/public/background.mp4');
  return {
    pdf: path.join(dir, 'source-a.pdf'),
    text: path.join(dir, 'source-b.txt'),
    image,
    video,
    broken: path.join(dir, 'broken.pdf'),
  };
}
module.exports = { pdf, fixtures };

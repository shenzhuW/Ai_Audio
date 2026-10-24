const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'fixtures/director'),
  temp = path.join(root, '.cache/phase06/fixture');
fs.mkdirSync(temp, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const paragraphs = [
  '为什么解释视频需要先确定时间轴？这是一段自制测试文稿。请想象一条河，声音沿着时间向前流动，画面负责解释我们正在说的对象，而不是每说一个词就换一个镜头。',
  '先固定声音，再安排镜头。句子结束、自然停顿和叙事转折可以帮助我们选择边界。同一个段落可以拆成多个镜头，相邻的两个段落也可以共享同一个视觉对象。',
  '画面有两条执行路线。纯代码动画用文字、图形和层级解释关系；素材路线先说明需要什么画面。还没有找到素材，就明确标记待匹配，不把检索意图当成真实素材。',
  '最后检查观众理解了什么。镜头的时长、引用和声音都应能追溯到批准版本。本样例使用本机系统声音和已知拼接位置，只验证导演时间映射，不声称是精确的声学对齐。',
];
const segments = [];
for (let i = 0; i < paragraphs.length; i++) {
  const input = path.join(temp, `input-${i}.json`),
    wav = path.join(temp, `speech-${i}.wav`),
    slot = path.join(temp, `slot-${i}.wav`);
  fs.writeFileSync(
    input,
    JSON.stringify({ voice: 'Microsoft Huihui Desktop', rate: 0, text: paragraphs[i] }),
  );
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      path.join(root, 'scripts/voice-sapi.ps1'),
      '-InputPath',
      input,
      '-OutputPath',
      wav,
    ],
    { windowsHide: true },
  );
  const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', wav],
        { encoding: 'utf8', windowsHide: true },
      ),
    ),
    ms = Math.ceil(Number(probe.format.duration) * 1000);
  if (ms > 30000) throw Error('Speech exceeds slot ' + ms);
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      wav,
      '-af',
      'apad',
      '-t',
      '30',
      '-ar',
      '22050',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      slot,
    ],
    { windowsHide: true },
  );
  segments.push({
    index: i,
    text: paragraphs[i],
    startMs: i * 30000,
    endMs: i * 30000 + ms,
    alignment: 'manual',
    method:
      'Known assembly offset + FFprobe whole speech file duration; includes SAPI leading/trailing silence; not phonetic alignment',
    speechDurationMs: ms,
  });
}
const list = path.join(temp, 'concat.txt');
fs.writeFileSync(
  list,
  segments
    .map((_, i) => "file '" + path.join(temp, `slot-${i}.wav`).replaceAll('\\', '/') + "'")
    .join('\n'),
);
const audio = path.join(out, 'director-120s.wav');
execFileSync(
  'ffmpeg',
  ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', audio],
  { windowsHide: true },
);
const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', audio], {
    encoding: 'utf8',
    windowsHide: true,
  }),
);
delete probe.format.filename;
fs.writeFileSync(
  path.join(out, 'sample.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      title: '解释视频为什么先确定时间轴',
      durationMs: 120000,
      fps: 30,
      totalFrames: 3600,
      audioSha256: createHash('sha256').update(fs.readFileSync(audio)).digest('hex'),
      segments,
      provenance:
        'Self-authored Chinese text and local Windows SAPI; no personal voice or external facts.',
    },
    null,
    2,
  ) + '\n',
);
fs.writeFileSync(path.join(out, 'ffprobe.json'), JSON.stringify(probe, null, 2) + '\n');
console.log(
  JSON.stringify({
    duration: probe.format.duration,
    segments: segments.map((s) => ({ startMs: s.startMs, endMs: s.endMs })),
    bytes: fs.statSync(audio).size,
  }),
);

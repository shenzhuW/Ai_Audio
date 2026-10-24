// Local-only speech inference transport. Never imports the Codex model runtime into the model.
const fs = require('node:fs/promises'),
  sync = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { execFile } = require('node:child_process'),
  { promisify } = require('node:util');
const exec = promisify(execFile),
  root = path.resolve(__dirname, '..');
const { isolatedEnvironment } = require('./render-worker.cjs');
const { killTree } = require('./codex-runtime.cjs');
const { mapAlignedWords } = require('../apps/web/src/server/voice/alignment.ts');
const python = () =>
  process.env.STUDIO_SPEECH_PYTHON || path.join(root, '.tools/speech-python/Scripts/python.exe');
const model = () =>
  process.env.STUDIO_WHISPER_MODEL_PATH || path.join(root, '.cache/voice-models/base.pt');
function inspectSpeech() {
  const maxSeconds = Number(process.env.STUDIO_SPEECH_MAX_SECONDS || 600);
  if (!Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 2147483)
    throw Error('SPEECH_CONFIG_INVALID');
  const configured =
    process.env.STUDIO_SPEECH_ENABLED === '1' &&
    sync.existsSync(python()) &&
    sync.existsSync(model());
  return {
    configured,
    mode: configured ? 'real' : 'unconfigured',
    model: 'openai-whisper/base',
    engine: 'stable-ts 2.19.1',
    maxSeconds,
    note: '真实本地ASR/给定文稿模型对齐；CPU运行，须试听校正；不使用均分时间代替对齐。',
  };
}
async function speech(input, dataDir, audit, signal) {
  if (input.provider === 'mock') throw Error('SPEECH_MOCK_NOT_REAL');
  if (input.provider !== 'whisper-local' || !inspectSpeech().configured)
    throw Error('SPEECH_NOT_CONFIGURED');
  const timeout = Number(process.env.STUDIO_SPEECH_TIMEOUT_MS || 600000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 3600000)
    throw Error('SPEECH_CONFIG_INVALID');
  const dir = path.join(dataDir, 'voice-work', audit.runId),
    request = path.join(dir, 'input.json'),
    output = path.join(dir, 'output.json');
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    operation: input.operation,
    language: input.language,
    audioPath: path.join(dataDir, 'voice-blobs', input.blob.id),
    modelPath: model(),
    ...(input.operation === 'align' ? { text: input.segments.map((s) => s.text).join('\n') } : {}),
  };
  await fs.writeFile(request, JSON.stringify(payload), { flag: 'wx' });
  audit.referenceTextProvided = input.operation === 'align';
  const env = {
    ...isolatedEnvironment(),
    PYTHONNOUSERSITE: '1',
    PYTHONUTF8: '1',
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
  };
  let timedOut = false,
    aborted = false,
    alarm;
  const pending = exec(python(), [path.join(root, 'scripts/voice-speech.py'), request, output], {
    cwd: dir,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env,
  });
  audit.processId = pending.child.pid;
  const abort = () => {
    aborted = true;
    killTree(pending.child);
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  alarm = setTimeout(() => {
    timedOut = true;
    killTree(pending.child);
  }, timeout);
  try {
    const child = await pending;
    audit.exitCode = 0;
    await fs.writeFile(path.join(dir, 'process.log'), child.stderr || '');
  } catch (e) {
    audit.exitCode = Number.isInteger(e.code) ? e.code : null;
    await fs.writeFile(path.join(dir, 'process.log'), String(e.stderr || e.message));
    throw Error(
      timedOut ? 'SPEECH_TIMEOUT' : aborted ? 'VOICE_CANCELLED' : 'SPEECH_PROCESS_FAILED',
    );
  } finally {
    clearTimeout(alarm);
    signal?.removeEventListener('abort', abort);
  }
  if ((await fs.stat(output)).size > 4 * 1024 * 1024) throw Error('SPEECH_OUTPUT_LIMIT');
  const data = JSON.parse(await fs.readFile(output, 'utf8'));
  audit.model = data.model;
  audit.modelSha256 = data.modelSha256;
  const common = {
    mode: input.mode,
    provider: 'whisper-local',
    purpose: 'final',
    audioSha256: input.blob.sha256,
    scriptRevisionId: input.scriptRevisionId,
    model: data.model,
    modelSha256: data.modelSha256,
    engineVersion: data.engineVersion,
    words: data.words,
    run: audit,
  };
  if (input.operation === 'transcribe')
    return {
      kind: 'asr',
      ...common,
      transcript: data.transcript,
      subtitleDraft: data.segments.filter((s) => s.endMs > s.startMs),
      notes: 'Whisper独立真实识别，未传参考文稿。字幕为未绑定草稿，可能繁简/同音错误，需人工校正。',
    };
  const metadata = await require('./voice-native.cjs').audioProbe(payload.audioPath, input, signal),
    mapped = mapAlignedWords(input.segments, data.words, metadata.durationMs, audit.runId);
  return {
    kind: 'alignment',
    ...common,
    ...mapped,
    notes: `给定文稿的真实Whisper/stable-ts模型对齐。${data.words.filter((w) => w.endMs === w.startMs).length}个零时长词未独立建Cue；句界来自有效模型词范围，不插值或均分，不保证人工实测精度。`,
  };
}
module.exports = { speech, inspectSpeech };

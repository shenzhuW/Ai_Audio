// Trusted host media adapter; never calls Codex or evaluates model/user code.
require('./register-typescript.cjs');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { execFile } = require('node:child_process'),
  { promisify } = require('node:util'),
  { randomUUID, createHash } = require('node:crypto');
const exec = promisify(execFile),
  root = path.resolve(__dirname, '..');
const { voiceBlobStore } = require('../apps/web/src/server/voice/storage.ts');
const { VoiceJobInputSchema, VoiceResultSchema } = require('../apps/web/src/domain/voice.ts');
const { isolatedEnvironment } = require('./render-worker.cjs');
const safeError = (e) =>
  e.name === 'AbortError'
    ? 'VOICE_CANCELLED'
    : e.killed || e.code === 'ETIMEDOUT'
      ? 'VOICE_TIMEOUT'
      : e.code === 'ENOENT'
        ? 'VOICE_TOOL_NOT_CONFIGURED'
        : 'VOICE_PROCESS_FAILED';
async function inspect() {
  if (process.platform !== 'win32' || process.env.STUDIO_SYSTEM_TTS_ENABLED !== '1')
    return {
      id: 'windows-sapi',
      configured: false,
      voices: [],
      note: '本机系统TTS未启用或不是Windows。',
    };
  try {
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(root, 'scripts/voice-sapi.ps1'),
        '-List',
      ],
      { windowsHide: true, timeout: 10000, maxBuffer: 100000, env: isolatedEnvironment() },
    );
    const parsed = JSON.parse(stdout);
    return {
      id: 'windows-sapi',
      configured: true,
      voices: Array.isArray(parsed) ? parsed : [parsed],
      note: '真实本机系统TTS，非Codex/云端神经模型；锚点为手工或估算。',
    };
  } catch {
    return { id: 'windows-sapi', configured: false, voices: [], note: '本机语音引擎不可用。' };
  }
}
async function audioProbe(file, input, signal) {
  let data;
  try {
    const { stdout } = await exec(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        file,
      ],
      {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        signal,
        env: isolatedEnvironment(),
      },
    );
    data = JSON.parse(stdout);
  } catch (e) {
    throw Error(
      e.name === 'AbortError'
        ? 'VOICE_CANCELLED'
        : e.code === 'ENOENT'
          ? 'VOICE_TOOL_NOT_CONFIGURED'
          : 'INVALID_AUDIO_CONTENT',
    );
  }
  const streams = data.streams || [],
    audio = streams.filter((s) => s.codec_type === 'audio'),
    ms = Math.ceil(Number(data.format?.duration) * 1000);
  if (
    audio.length !== 1 ||
    streams.some((s) => s.codec_type !== 'audio') ||
    ![
      'pcm_s16le',
      'pcm_s24le',
      'pcm_s32le',
      'pcm_f32le',
      'pcm_u8',
      'mp3',
      'aac',
      'flac',
      'vorbis',
      'opus',
    ].includes(audio[0].codec_name) ||
    !Number.isFinite(ms) ||
    ms <= 0 ||
    ms > input.maxDurationMs
  )
    throw Error('INVALID_AUDIO_CONTENT');
  const sampleRate = Number(audio[0].sample_rate),
    channels = audio[0].channels;
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > 8
  )
    throw Error('INVALID_AUDIO_CONTENT');
  return { durationMs: ms, codec: audio[0].codec_name, sampleRate, channels };
}
async function run(raw, dataDir, { signal } = {}) {
  const input = VoiceJobInputSchema.parse(raw),
    runId = randomUUID(),
    started = Date.now(),
    audit = {
      provider: input.provider,
      runId,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      purpose: input.purpose,
      failureReason: null,
      operation: input.operation,
      inputSha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      ...(input.blob ? { audioSha256: input.blob.sha256 } : {}),
    };
  try {
    if (signal?.aborted) throw Error('VOICE_CANCELLED');
    const store = voiceBlobStore(path.join(dataDir, 'voice-blobs'), input.maxAudioBytes);
    if (input.operation !== 'audio') {
      if (!input.blob) throw Error('VOICE_AUDIO_REQUIRED');
      await store.read(input.blob);
      const metadata = await audioProbe(
        path.join(dataDir, 'voice-blobs', input.blob.id),
        input,
        signal,
      );
      if (
        metadata.durationMs >
        require('./voice-speech-native.cjs').inspectSpeech().maxSeconds * 1000
      )
        throw Error('SPEECH_DURATION_LIMIT');
      const result = await require('./voice-speech-native.cjs').speech(
        input,
        dataDir,
        audit,
        signal,
      );
      audit.durationMs = Date.now() - started;
      return VoiceResultSchema.parse(result);
    }
    let blob = input.blob;
    if (input.mode === 'tts') {
      if (input.provider === 'mock') throw Error('VOICE_MOCK_NO_AUDIO');
      if (
        input.provider !== 'windows-sapi' ||
        process.env.STUDIO_SYSTEM_TTS_ENABLED !== '1' ||
        process.platform !== 'win32'
      )
        throw Error('VOICE_TTS_NOT_CONFIGURED');
      const status = await inspect();
      if (!status.configured || !status.voices.some((v) => v.name === input.voice))
        throw Error('VOICE_TTS_NOT_CONFIGURED');
      const dir = path.join(dataDir, 'voice-work', runId),
        target = path.join(dir, 'speech.wav');
      await fs.mkdir(dir, { recursive: true });
      const text = (input.purpose === 'preview' ? input.segments.slice(0, 1) : input.segments)
        .map((s) => s.text)
        .join('\n');
      const payload = path.join(dir, 'input.json');
      await fs.writeFile(payload, JSON.stringify({ text, voice: input.voice, rate: input.rate }), {
        flag: 'wx',
      });
      let watch,
        overflow = false;
      const controller = new AbortController(),
        abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      try {
        watch = setInterval(() => {
          fs.stat(target)
            .then((stat) => {
              if (stat.size > input.maxAudioBytes) {
                overflow = true;
                abort();
              }
            })
            .catch(() => {});
        }, 200);
        await exec(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-File',
            path.join(root, 'scripts/voice-sapi.ps1'),
            '-InputPath',
            payload,
            '-OutputPath',
            target,
          ],
          {
            windowsHide: true,
            timeout: 120000,
            maxBuffer: 100000,
            signal: controller.signal,
            env: isolatedEnvironment(),
          },
        );
      } catch (e) {
        throw Error(overflow ? 'UPLOAD_LIMIT' : safeError(e));
      } finally {
        clearInterval(watch);
        signal?.removeEventListener('abort', abort);
      }
      blob = await store.put(
        input.purpose === 'preview' ? 'system-voice-preview.wav' : 'system-voice-final.wav',
        await fs.readFile(target),
      );
    }
    if (!blob) throw Error('VOICE_AUDIO_REQUIRED');
    await store.read(blob);
    const metadata = await audioProbe(path.join(dataDir, 'voice-blobs', blob.id), input, signal);
    audit.durationMs = Date.now() - started;
    return VoiceResultSchema.parse({
      kind: 'audio',
      mode: input.mode,
      provider: input.provider,
      purpose: input.purpose,
      audio: {
        blob,
        ...metadata,
        origin: input.mode,
        purpose: input.purpose,
        provider: input.provider,
        runId,
      },
      notes:
        '真实FFprobe音频时长；初始Cue与字幕为人工/估算，不是精确转录。可另行执行已配置的真实识别与强制对齐。',
      run: audit,
    });
  } catch (e) {
    audit.durationMs = Date.now() - started;
    audit.failureReason = /^[A-Z_]{3,80}$/.test(e.message) ? e.message : safeError(e);
    throw Object.assign(Error(audit.failureReason), { voiceRun: audit });
  }
}
module.exports = {
  run,
  inspect,
  audioProbe,
  inspectSpeech: () => require('./voice-speech-native.cjs').inspectSpeech(),
};

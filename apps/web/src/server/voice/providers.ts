import { resolve } from 'node:path';
import { AppError } from '../errors';
import {
  VoiceResultSchema,
  VoiceRunSchema,
  type VoiceJobInput,
  type VoiceResult,
} from '../../domain/voice';
const root = resolve(
  process.cwd(),
  process.cwd().replaceAll('\\', '/').endsWith('/apps/web') ? '../..' : '.',
);
async function native() {
  const { createRequire } = await import(/* webpackIgnore: true */ 'node:module');
  return createRequire(resolve(root, 'package.json'))(resolve(root, 'scripts/voice-native.cjs'));
}
export interface TtsProvider {
  readonly id: string;
  synthesize(
    input: VoiceJobInput,
    context: { dataDir: string; signal?: AbortSignal },
  ): Promise<VoiceResult>;
}
export interface TranscriptionProvider {
  transcribe(input: {
    audioSha256: string;
    signal?: AbortSignal;
  }): Promise<{ mode: 'real' | 'mock'; text: string }>;
}
export interface AlignmentProvider {
  align(input: {
    audioSha256: string;
    scriptRevisionId: string;
    signal?: AbortSignal;
  }): Promise<{ mode: 'real' | 'mock'; cues: unknown[] }>;
}
export class UnconfiguredTranscriptionProvider implements TranscriptionProvider {
  async transcribe(): Promise<never> {
    throw new AppError('ASR_NOT_CONFIGURED', 'ASR未配置，不生成假转录。', 503);
  }
}
export class UnconfiguredAlignmentProvider implements AlignmentProvider {
  async align(): Promise<never> {
    throw new AppError('ALIGNMENT_NOT_CONFIGURED', '强制对齐未配置，请手动或明确估算。', 503);
  }
}
export async function processVoice(
  input: VoiceJobInput,
  context: { dataDir: string; signal?: AbortSignal },
): Promise<VoiceResult> {
  try {
    return VoiceResultSchema.parse(
      await (await native()).run(input, context.dataDir, { signal: context.signal }),
    );
  } catch (e) {
    const error = e as Error & { voiceRun?: unknown };
    const code = /^[A-Z_]{3,80}$/.test(error.message) ? error.message : 'VOICE_PROCESS_FAILED';
    throw Object.assign(new AppError(code, `配音任务未完成：${code}`, 502), {
      voiceRun: error.voiceRun ? VoiceRunSchema.parse(error.voiceRun) : undefined,
    });
  }
}
export class SystemTtsProvider implements TtsProvider {
  readonly id = 'windows-sapi';
  synthesize(input: VoiceJobInput, context: { dataDir: string; signal?: AbortSignal }) {
    return processVoice(input, context);
  }
}
let cache:
    | Promise<{
        id: string;
        configured: boolean;
        voices: { name: string; language: string }[];
        note: string;
      }>
    | undefined,
  at = 0;
export async function voiceProviders() {
  if (!cache || Date.now() - at > 300000) {
    at = Date.now();
    cache = native().then((n) => n.inspect());
  }
  const speech = (await native()).inspectSpeech() as {
    configured: boolean;
    mode: 'real' | 'unconfigured';
    model: string;
    engine: string;
    maxSeconds: number;
    note: string;
  };
  return {
    system: await cache,
    cloudTts: { mode: 'unconfigured', configured: false },
    asr: speech,
    alignment: speech,
    mock: { mode: 'mock', audioAvailable: false, note: '显式Mock仅演示失败/状态，不输出假声音。' },
  };
}

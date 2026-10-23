import { resolve } from 'node:path';
import { AppError } from '../errors';
import { AiRunSchema } from '../../domain/ai';
const root = resolve(
  process.cwd(),
  process.cwd().replaceAll('\\', '/').endsWith('/apps/web') ? '../..' : '.',
);
async function runtime() {
  // Load the host bridge natively; Next must not try to bundle the installed CLI.
  const { createRequire } = await import(/* webpackIgnore: true */ 'node:module');
  return createRequire(resolve(root, 'package.json'))(resolve(root, 'scripts/codex-runtime.cjs'));
}
export const codexConfigured = () => process.env.STUDIO_CODEX_ENABLED === '1';
export async function codexData(request: { prompt: string; schema: object; signal?: AbortSignal }) {
  if (!codexConfigured())
    throw new AppError('PROVIDER_NOT_CONFIGURED', 'Codex 运行时尚未启用。', 503);
  try {
    const result = await (await runtime()).runCodex(request);
    return { value: result.value as unknown, audit: AiRunSchema.parse(result.audit) };
  } catch (error) {
    const e = error as Error & { aiRun?: unknown };
    const code = /^[A-Z_]{3,80}$/.test(e.message) ? e.message : 'CODEX_PROCESS_FAILED';
    throw Object.assign(new AppError(code, 'Codex 数据任务未完成：' + code, 502), {
      aiRun: e.aiRun,
    });
  }
}
export const closedSchema = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

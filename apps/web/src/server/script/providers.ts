import { randomUUID } from 'node:crypto';
import { ScriptSegmentSchema, type ScriptJobInput, type ScriptResult } from '../../domain/script';
import { AppError } from '../errors';
export interface ScriptProvider {
  readonly id: string;
  readonly mode: 'real' | 'mock' | 'unconfigured';
  generate(input: ScriptJobInput): Promise<ScriptResult>;
  rewrite(input: ScriptJobInput): Promise<ScriptResult>;
}
export class UnconfiguredScriptProvider implements ScriptProvider {
  readonly id = 'unconfigured';
  readonly mode = 'unconfigured' as const;
  async generate(_input: ScriptJobInput): Promise<never> {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '真实写作模型未配置，不会返回假 AI 文稿。', 503);
  }
  async rewrite(input: ScriptJobInput): Promise<never> {
    return this.generate(input);
  }
}
export class MockScriptProvider implements ScriptProvider {
  readonly id = 'explicit-script-fixture';
  readonly mode = 'mock' as const;
  async generate(input: ScriptJobInput): Promise<ScriptResult> {
    const segments = input.segments.length
      ? input.segments.map((s) => ({
          ...s,
          text: `${s.text}\n（Mock 整体改写演示，未调用真实模型）`,
        }))
      : ['hook', 'explanation', 'evidence', 'conclusion'].map((purpose, i) =>
          ScriptSegmentSchema.parse({
            id: randomUUID(),
            purpose,
            text:
              i === 0
                ? 'Mock 开场演示：这个主题最值得解释的问题是什么？'
                : i === 1
                  ? 'Mock 解释演示：围绕同一个问题，先说明原因，再连接结果。'
                  : i === 2
                    ? input.facts[0]
                      ? `Mock 引用演示：资料声称“${input.facts[0].text}”。状态为 ${input.facts[0].status}，不能当作已核实事实。`
                      : 'Mock 证据占位：尚无研究依据，不补写事实或数字。'
                    : 'Mock 总结演示：回到开场问题，区分已知信息和仍待核验的部分。',
            viewerTakeaway: 'Mock 叙事结构演示；请人工编辑',
            visualIntent: '仅视觉意图，后续导演可按语义安排多个镜头',
            factBindings:
              i === 2 && input.facts[0]
                ? [{ claimId: input.facts[0].claimId, sourceIds: input.facts[0].sourceIds }]
                : [],
          }),
        );
    return {
      mode: 'mock',
      segments,
      notes: '显式 Mock 结构演示，未调用模型，不能作为真实 AI 或事实核验结果。',
    };
  }
  async rewrite(input: ScriptJobInput): Promise<ScriptResult> {
    const s = input.segments.find((s) => s.id === input.segmentId);
    if (!s) throw new AppError('NOT_FOUND', '目标段落不存在。', 404);
    return {
      mode: 'mock',
      segments: [
        { ...s, text: `${s.text}\n（Mock 局部改写演示：${input.instruction}；未调用真实模型）` },
      ],
      notes: '仅改写指定段落的 Mock 演示；不新增事实引用。',
    };
  }
}
export const scriptProvider = (mode: ScriptJobInput['mode']): ScriptProvider =>
  mode === 'mock' ? new MockScriptProvider() : new UnconfiguredScriptProvider();

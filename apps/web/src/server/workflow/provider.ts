import type { LanguageProvider } from '../../domain/providers';
export class MockWorkflowTextProvider implements LanguageProvider {
  readonly mode = 'mock' as const;
  readonly name = 'workflow-fixture-text';
  async generate(input: { schemaVersion: 1; prompt: string; sourceIds: string[] }) {
    return {
      text: `【模拟文本 · 未核实】\n${input.prompt.slice(0, 45000)}\n\n这是工作流验收用 Mock 文本，不代表真实检索、事实核验、配音或视频。`,
      sourceIds: [...input.sourceIds],
    };
  }
}

import type { ResearchJobInput, ResearchResult, ResearchBlob } from '../../domain/research';
import { AppError } from '../errors';
export interface SearchProvider {
  readonly id: string;
  readonly mode: 'real' | 'mock' | 'unconfigured';
  search(query: string): Promise<Extract<ResearchResult, { kind: 'search' }>>;
}
export interface ContentProvider {
  readonly id: string;
  readonly mode: 'real' | 'mock' | 'unconfigured';
  extract(blob: ResearchBlob): Promise<Extract<ResearchResult, { kind: 'analyze' }>>;
}
export interface VisionProvider {
  readonly id: string;
  readonly mode: 'real' | 'mock' | 'unconfigured';
  describe(blob: ResearchBlob): Promise<{ summary: string; provenance: 'real' | 'mock' }>;
}
export class UnconfiguredProvider implements SearchProvider, ContentProvider, VisionProvider {
  readonly id = 'unconfigured';
  readonly mode = 'unconfigured' as const;
  async search(_query: string): Promise<never> {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '网络搜索提供方未配置。', 503);
  }
  async extract(_blob: ResearchBlob): Promise<never> {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '内容提取提供方未配置。', 503);
  }
  async describe(_blob: ResearchBlob): Promise<never> {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '视觉/OCR 提供方未配置。', 503);
  }
}
export class MockSearchProvider implements SearchProvider {
  readonly id = 'research-search-fixture';
  readonly mode = 'mock' as const;
  async search(query: string) {
    return {
      kind: 'search' as const,
      mode: 'mock' as const,
      candidates: [],
      notes: `Mock 搜索流程演示：${query.slice(0, 1000)}。未请求网络，没有真实文章、来源 URL 或核验结论。`,
    };
  }
}
export class MockVisionProvider implements VisionProvider {
  readonly id = 'research-vision-fixture';
  readonly mode = 'mock' as const;
  async describe(_blob: ResearchBlob) {
    return {
      summary: 'Mock 视觉说明：仅演示内容索引结构，未识别画面，不构成事实证据。',
      provenance: 'mock' as const,
    };
  }
}
export const researchProviderStatus = [
  {
    id: 'codex-cli',
    mode: process.env.STUDIO_CODEX_ENABLED === '1' ? 'real' : 'unconfigured',
    capabilities: ['实时搜索', '图片与视频关键帧语义', '结构化文稿；不含 ASR'],
    configured: process.env.STUDIO_CODEX_ENABLED === '1',
  },
  {
    id: 'local-content',
    mode: 'real',
    capabilities: ['PDF文本与页数', '图片尺寸', 'FFprobe', '稀疏视频抽帧'],
    configured: true,
  },
  { id: 'web-search', mode: 'unconfigured', capabilities: ['网络文章搜索'], configured: false },
  {
    id: 'vision-asr',
    mode: 'unconfigured',
    capabilities: ['视觉语义', 'OCR', 'ASR'],
    configured: false,
  },
  {
    id: 'explicit-fixture',
    mode: 'mock',
    capabilities: ['显式 Mock 演示，无真实文章'],
    configured: true,
  },
] as const;
export function researchProviderName(input: ResearchJobInput) {
  if (input.mode === 'real' && (input.kind === 'search' || input.vision))
    return 'Codex CLI · 真实模型分析，未独立核实';
  return input.mode === 'real'
    ? '本地真实提取'
    : input.mode === 'mock'
      ? 'Mock · 未核实'
      : 'Provider 未配置';
}

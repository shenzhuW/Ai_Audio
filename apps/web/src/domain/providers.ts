import { z } from 'zod';
export const BlobRefSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  sha256: z.string().length(64),
  mime: z.string(),
});
export const JobInputSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.uuid(),
  inputRevisionIds: z.array(z.uuid()).min(1),
  idempotencyKey: z.string().min(1),
  maxAttempts: z.number().int().min(1),
  budgetLimit: z.number().nonnegative(),
});
export const JobSchema = JobInputSchema.extend({
  id: z.uuid(),
  kind: z.enum(['research', 'script', 'voice', 'director', 'asset', 'motion', 'render']),
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  attempt: z.number().int().nonnegative(),
  errorCode: z.string().optional(),
});
export const SourceCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  title: z.string(),
  sourceUrl: z.url().optional(),
  provenance: z.enum(['mock', 'real']),
  verification: z.literal('unverified'),
  licenseStatus: z.enum(['research_only', 'pending', 'cleared', 'blocked']),
});
type BlobRef = z.infer<typeof BlobRefSchema>;
type Job = z.infer<typeof JobSchema>;
type JobInput = z.infer<typeof JobInputSchema>;
export interface ProviderIdentity {
  readonly mode: 'mock' | 'real';
  readonly name: string;
}
export interface ResearchProvider extends ProviderIdentity {
  search(query: string, limit: number): Promise<z.infer<typeof SourceCandidateSchema>[]>;
}
export interface LanguageProvider extends ProviderIdentity {
  generate(input: {
    schemaVersion: 1;
    prompt: string;
    sourceIds: string[];
  }): Promise<{ text: string; sourceIds: string[] }>;
}
export interface VoiceProvider extends ProviderIdentity {
  synthesize(input: {
    scriptRevisionId: string;
    text: string;
    language: string;
  }): Promise<{ audio: BlobRef; durationMs: number }>;
}
export interface AssetProvider extends ProviderIdentity {
  search(input: { visualIntent: string; shotId: string; durationMs: number }): Promise<
    {
      sourceAssetId: string;
      sourceInMs?: number;
      sourceOutMs?: number;
      licenseStatus: 'research_only' | 'pending' | 'cleared' | 'blocked';
      evidenceRef?: string;
    }[]
  >;
}
export interface MediaProcessor {
  probe(input: BlobRef): Promise<{ durationMs: number; width: number; height: number }>;
  prepare(input: {
    bindingRevisionId: string;
    source: BlobRef;
    sourceInMs: number;
    sourceOutMs: number;
  }): Promise<BlobRef>;
}
export interface RenderWorker {
  render(
    input: JobInput & { sceneRevisionIds: string[]; fps: number; width: number; height: number },
  ): Promise<{ mp4: BlobRef; manifestHash: string }>;
}
export interface JobQueue {
  enqueue(input: JobInput & { kind: Job['kind'] }): Promise<Job>;
  get(id: string): Promise<Job | null>;
  cancel(id: string): Promise<Job>;
  retry(id: string): Promise<Job>;
}
// Ports only in Phase 00. No fake jobs, generated audio or rendered output.
export class MockResearchProvider implements ResearchProvider {
  readonly mode = 'mock' as const;
  readonly name = 'fixture-research';
  async search(query: string, limit: number) {
    return limit > 0
      ? [
          SourceCandidateSchema.parse({
            schemaVersion: 1,
            id: 'demo-source-gpu',
            title: `模拟研究资料：${query}`,
            provenance: 'mock',
            verification: 'unverified',
            licenseStatus: 'research_only',
          }),
        ]
      : [];
  }
}

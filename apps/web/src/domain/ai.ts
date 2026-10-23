import { z } from 'zod';
export const AiRunSchema = z
  .object({
    provider: z.literal('codex-cli'),
    cliVersion: z.string().max(80),
    model: z.string().max(150),
    runId: z.string().max(150).nullable(),
    searchMode: z.enum(['live', 'disabled']),
    startedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    usage: z.record(z.string().max(100), z.number().nonnegative()).nullable(),
    quota: z.null(),
    quotaNote: z.string().max(500),
    failureReason: z.string().max(100).nullable(),
    policy: z.literal('data-only-v1'),
    catalogSha256: z.string().max(64).nullable(),
    jobAttempt: z.number().int().positive().optional(),
    isolation: z
      .object({
        modelShell: z.literal('disabled'),
        modelPatch: z.literal('disabled'),
        enabledMcpServers: z.literal(0),
        codeModeHost: z.literal('v8-data-only'),
        userConfigIgnored: z.literal(true),
        ephemeral: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict();
export type AiRun = z.infer<typeof AiRunSchema>;

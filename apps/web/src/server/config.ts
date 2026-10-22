import { resolve } from 'node:path';
import { z } from 'zod';
const EnvSchema = z.object({
  STUDIO_MAX_DURATION_SECONDS: z.coerce.number().int().positive().max(2147483).default(3600),
  STUDIO_MAX_UPLOAD_MB: z.coerce.number().int().positive().max(100).default(10),
  STUDIO_DATA_DIR: z.string().default('.data'),
  DATABASE_URL: z.string().optional(),
});
export function config() {
  const e = EnvSchema.parse(process.env);
  return {
    dataDir: resolve(e.STUDIO_DATA_DIR),
    databaseUrl: e.DATABASE_URL,
    maxDurationMs: e.STUDIO_MAX_DURATION_SECONDS * 1000,
    maxUploadBytes: e.STUDIO_MAX_UPLOAD_MB * 1024 * 1024,
  };
}

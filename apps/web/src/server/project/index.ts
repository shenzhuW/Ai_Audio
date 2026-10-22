import { join } from 'node:path';
import { config } from '../config';
import { createProjectService } from './service';
import { openRepository, type ProjectRepository } from './repository';
import { openPostgresRepository } from './postgres';
const globalDb = globalThis as typeof globalThis & {
  studioRepository?: Promise<ProjectRepository>;
};
export async function projects() {
  const c = config();
  globalDb.studioRepository ??= c.databaseUrl?.startsWith('postgres')
    ? openPostgresRepository(c.databaseUrl)
    : openRepository(c.databaseUrl || `file:${join(c.dataDir, 'studio.db').replaceAll('\\', '/')}`);
  try {
    return createProjectService(await globalDb.studioRepository, c);
  } catch (error) {
    globalDb.studioRepository = undefined;
    throw error;
  }
}

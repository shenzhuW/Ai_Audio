import { join } from 'node:path';
import { config } from '../config';
import { projects } from '../project';
import { openWorkflowRepository, type WorkflowRepository } from './repository';
import { createWorkflowService } from './service';
const globalStore = globalThis as typeof globalThis & {
  studioWorkflow?: Promise<WorkflowRepository>;
};
export async function workflow() {
  const c = config();
  // Ensure SQLite's existing Project table exists; never seed or modify user projects.
  await projects();
  globalStore.studioWorkflow ??= openWorkflowRepository(
    c.databaseUrl || `file:${join(c.dataDir, 'studio.db').replaceAll('\\', '/')}`,
  );
  try {
    return createWorkflowService(await globalStore.studioWorkflow);
  } catch (e) {
    globalStore.studioWorkflow = undefined;
    throw e;
  }
}

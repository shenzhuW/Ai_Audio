import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openRepository } from '../../apps/web/src/server/project/repository';
import { createProjectService } from '../../apps/web/src/server/project/service';
import { openWorkflowRepository } from '../../apps/web/src/server/workflow/repository';
import { createWorkflowService } from '../../apps/web/src/server/workflow/service';
test('SQLite workflow transactions survive reopening, roll back failures and preserve legacy project JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-workflow-'));
  const url = 'file:' + join(dir, 'test.db').replaceAll('\\', '/');
  const projectRepo = await openRepository(url);
  const p = await createProjectService(projectRepo, { maxDurationMs: 3600000 }).create(
    {
      title: 'Persist workflow',
      prompt: 'test',
      targetDurationMs: 30000,
      width: 1080,
      height: 1920,
      entryType: 'topic',
      voiceMode: 'tts',
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    'local-user',
  );
  let repo = await openWorkflowRepository(url);
  let service = createWorkflowService(repo);
  const r = (await service.execute(
    p.id,
    'local-user',
    { action: 'create', type: 'research', text: 'saved', inputRevisionIds: [] },
    randomUUID(),
  )) as any;
  const review = (await service.execute(
    p.id,
    'local-user',
    { action: 'submit', revisionId: r.id, expectedVersion: r.version },
    randomUUID(),
  )) as any;
  const approved = (await service.execute(
    p.id,
    'local-user',
    { action: 'approve', revisionId: r.id, expectedVersion: review.version },
    'approve-once',
  )) as any;
  const before = await service.read(p.id, 'local-user');
  const direct = new DatabaseSync(url.slice(5));
  assert.throws(
    () =>
      direct.prepare('UPDATE workflow_revisions SET document=? WHERE id=?').run('{}', approved.id),
    /immutable/,
  );
  assert.throws(
    () =>
      direct.prepare('DELETE FROM workflow_approval_events WHERE revision_id=?').run(approved.id),
    /append only/,
  );
  direct.close();
  await assert.rejects(
    service.execute(
      p.id,
      'local-user',
      { action: 'patch', revisionId: r.id, expectedVersion: approved.version, text: 'bad' },
      randomUUID(),
    ),
    { code: 'IMMUTABLE_REVISION' },
  );
  assert.deepEqual(await service.read(p.id, 'local-user'), before);
  await repo.close();
  repo = await openWorkflowRepository(url);
  service = createWorkflowService(repo);
  assert.deepEqual(await service.read(p.id, 'local-user'), before);
  assert.deepEqual(await projectRepo.get(p.id, 'local-user'), p);
  await assert.rejects(service.read(p.id, 'other-owner'), { code: 'NOT_FOUND' });
  await repo.close();
  await projectRepo.close();
  await rm(dir, { recursive: true, force: true });
});

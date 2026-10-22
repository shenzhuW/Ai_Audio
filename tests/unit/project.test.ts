import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectService } from '../../apps/web/src/server/project/service';
import { openRepository } from '../../apps/web/src/server/project/repository';
import { parseDuration } from '../../apps/web/src/domain/project';

const brief = {
  title: '测试项目',
  prompt: '解释 GPU 并行计算',
  targetDurationMs: 30000,
  width: 1080,
  height: 1920,
  fps: 30,
  entryType: 'topic',
  voiceMode: 'tts',
  language: 'zh-CN',
  budgetLimit: { currency: 'CNY', amount: 50 },
};
test('Real database: 30/240 seconds and all entry modes survive closing and reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-project-'));
  const url = `file:${join(dir, 'test.db').replaceAll('\\', '/')}`;
  const repo = await openRepository(url);
  const service = createProjectService(repo, { maxDurationMs: 3600000 });
  const a = await service.create(brief, 'local-user');
  const b = await service.create(
    {
      ...brief,
      targetDurationMs: 240000,
      entryType: 'script',
      voiceMode: 'none',
      width: 1920,
      height: 1080,
    },
    'local-user',
  );
  const c = await service.create(
    { ...brief, entryType: 'upload', voiceMode: 'import' },
    'local-user',
  );
  await repo.close();
  const reopened = await openRepository(url);
  const s = createProjectService(reopened, { maxDurationMs: 3600000 });
  assert.equal((await s.get(a.id, 'local-user')).targetDurationMs, 30000);
  assert.equal((await s.get(b.id, 'local-user')).targetDurationMs, 240000);
  assert.equal((await s.get(c.id, 'local-user')).input.entryType, 'upload');
  assert.equal((await s.list('local-user')).length, 3);
  assert.equal((await s.list('other-user')).length, 0);
  await assert.rejects(s.get(a.id, 'other-user'), { code: 'NOT_FOUND' });
  await reopened.close();
  await rm(dir, { recursive: true, force: true });
});
test('Real database: atomic optimistic update permits only one writer', async () => {
  const repo = await openRepository('file::memory:');
  const s = createProjectService(repo, { maxDurationMs: 3600000 });
  const p = await s.create(brief, 'local-user');
  const results = await Promise.allSettled([
    s.update(p.id, { expectedVersion: 1, title: '版本 A' }, 'local-user'),
    s.update(p.id, { expectedVersion: 1, title: '版本 B' }, 'local-user'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected?.reason.code, 'REVISION_CONFLICT');
  assert.equal((await s.get(p.id, 'local-user')).version, 2);
  await repo.close();
});
test('Reject blank prompt, zero/negative/nonfinite duration, invalid aspect, budget, unknown keys', async () => {
  const repo = await openRepository('file::memory:');
  const s = createProjectService(repo, { maxDurationMs: 3600000 });
  for (const patch of [
    { prompt: '  ' },
    { targetDurationMs: 0 },
    { targetDurationMs: -1 },
    { targetDurationMs: Infinity },
    { targetDurationMs: 1.5 },
    { width: 100, height: 100 },
    { budgetLimit: { currency: 'CNY', amount: -1 } },
    { status: 'approved' },
  ]) {
    await assert.rejects(s.create({ ...brief, ...patch }, 'local-user'), {
      code: 'VALIDATION_ERROR',
    });
  }
  await assert.rejects(s.create({ ...brief, targetDurationMs: 3600001 }, 'local-user'), {
    code: 'DURATION_LIMIT',
  });
  assert.equal((await s.list('local-user')).length, 0);
  await repo.close();
});
test('Seconds and mm:ss are exact, invalid strings never silently normalize', () => {
  assert.equal(parseDuration('30'), 30000);
  assert.equal(parseDuration('4:00'), 240000);
  assert.equal(parseDuration('00:30.5'), 30500);
  for (const value of ['', '0', '-1', '1:60', 'abc', 'Infinity', '1:2:3', '1e2', '0.0001'])
    assert.throws(() => parseDuration(value));
});

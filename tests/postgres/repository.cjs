require('../../scripts/register-typescript.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { openPostgresRepository } = require('../../apps/web/src/server/project/postgres.ts');
const { openRepository } = require('../../apps/web/src/server/project/repository.ts');
const { createProjectService } = require('../../apps/web/src/server/project/service.ts');

module.exports = async function verifyRepository(url) {
  assert.match(new URL(url).pathname, /^\/studio_phase(?:005|01)_/);
  const pg = await openPostgresRepository(url);
  const sqlite = await openRepository('file::memory:');
  const owner = `integration-${randomUUID()}`;
  const service = createProjectService(pg, { maxDurationMs: 3600000 });
  const saved = [];
  try {
    for (const entryType of ['topic', 'script', 'upload']) {
      for (const voiceMode of ['tts', 'import', 'none']) {
        const p = await service.create(
          {
            title: `PostgreSQL ${entryType}/${voiceMode}`,
            prompt: '真实数据库集成验收资料',
            targetDurationMs: voiceMode === 'tts' ? 30000 : voiceMode === 'import' ? 240000 : 90500,
            width: 1080,
            height: 1920,
            fps: 30,
            entryType,
            voiceMode,
            budgetLimit: { currency: 'CNY', amount: 50 },
          },
          owner,
        );
        await sqlite.create(p);
        assert.deepEqual(await pg.get(p.id, owner), await sqlite.get(p.id, owner));
        saved.push(p);
      }
    }
    assert.equal((await pg.list(owner)).length, 9);
    assert.equal(await pg.get(saved[0].id, 'another-owner'), null);
    const races = await Promise.allSettled([
      service.update(saved[0].id, { expectedVersion: 1, title: '设置修改 A' }, owner),
      service.update(saved[0].id, { expectedVersion: 1, title: '设置修改 B' }, owner),
    ]);
    assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(races.find((r) => r.status === 'rejected').reason.code, 'REVISION_CONFLICT');
    assert.equal((await pg.get(saved[0].id, owner)).version, 2);
    const expected = await pg.list(owner);
    await pg.close();
    const reopened = await openPostgresRepository(url);
    try {
      assert.deepEqual(await reopened.list(owner), expected);
    } finally {
      await reopened.close();
    }
    return {
      combinations: 9,
      compatibleDocuments: 9,
      concurrentWinners: 1,
      reconnectPersistent: true,
    };
  } finally {
    await pg.close();
    await sqlite.close();
  }
};

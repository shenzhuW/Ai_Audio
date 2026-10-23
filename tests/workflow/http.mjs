import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function workflowAcceptance(base, backend, evidenceDir) {
  const checks = [];
  const page = await fetch(base + '/projects/new');
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
  async function req(path, method = 'GET', body, key = randomUUID(), status = 200) {
    const r = await fetch(base + '/api/v1' + path, {
      method,
      headers: { ...headers, ...(method === 'GET' ? {} : { 'Idempotency-Key': key }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    const result = await r.json();
    assert.equal(r.status, status, JSON.stringify(result));
    return result.data ?? result.error;
  }
  async function check(name, work) {
    await work();
    checks.push({ name, status: 'PASS' });
    console.log('PASS ' + name);
  }
  const p = await req(
    '/projects',
    'POST',
    {
      title: 'Phase01 ' + backend,
      prompt: '用户原始需求完整保留',
      targetDurationMs: 240000,
      width: 1920,
      height: 1080,
      entryType: 'topic',
      voiceMode: 'none',
      budgetLimit: { currency: 'CNY', amount: 50 },
    },
    randomUUID(),
    201,
  );
  const workflowPath = `/projects/${p.id}/workflow`;
  let r, approved, script, otherProjectId;
  const path = (r) => `/artifacts/${r.artifactId}/revisions/${r.id}`;
  await check('旧项目 API / 新工作流隔离，创建草稿不改变原始需求', async () => {
    assert.equal((await req(workflowPath)).revisions.length, 0);
    r = await req(
      `/projects/${p.id}/artifacts`,
      'POST',
      { type: 'research', text: '未核实的手动研究草稿', inputRevisionIds: [] },
      randomUUID(),
      201,
    );
    assert.equal(r.mock, false);
    assert.equal(r.status, 'draft');
    assert.deepEqual(await req(`/projects/${p.id}`), p);
  });
  await check('草稿保存、驳回、fork 和具体历史读取', async () => {
    r = await req(path(r), 'PATCH', {
      expectedVersion: r.version,
      text: '已编辑但未核实的研究草稿',
    });
    r = await req(path(r) + '/submit', 'POST', { expectedVersion: r.version });
    r = await req(path(r) + '/reject', 'POST', { expectedVersion: r.version, comment: '补充依据' });
    const old = r;
    r = await req(`/artifacts/${r.artifactId}/revisions`, 'POST', {
      revisionId: r.id,
      expectedVersion: r.version,
    });
    assert.equal(r.parentRevisionId, old.id);
    assert.equal(r.revisionNumber, 2);
    assert.deepEqual(await req(path(old)), old);
  });
  await check('批准、原子下游任务、同键并发重放和异内容冲突', async () => {
    r = await req(path(r) + '/submit', 'POST', { expectedVersion: r.version });
    const key = randomUUID(),
      body = { expectedVersion: r.version, comment: '批准本次修订' };
    const both = await Promise.all([
      req(path(r) + '/approve', 'POST', body, key),
      req(path(r) + '/approve', 'POST', body, key),
    ]);
    assert.deepEqual(both[0], both[1]);
    approved = both[0];
    const w = await req(workflowPath);
    assert.equal(w.jobs.length, 1);
    assert.equal(w.jobs[0].kind, 'script');
    assert.deepEqual(w.jobs[0].inputRevisionIds, [approved.id]);
    await req(path(r) + '/approve', 'POST', { ...body, comment: 'changed' }, key, 409);
    await req(path(r) + '/approve', 'POST', body, randomUUID(), 409);
    await req(
      path(approved),
      'PATCH',
      { expectedVersion: approved.version, text: '不应覆写' },
      randomUUID(),
      422,
    );
  });
  await check('双客户端不同修订批准：旧候选 409，新候选成功且旧批准仍可读', async () => {
    let a = await req(`/artifacts/${r.artifactId}/revisions`, 'POST', {
      revisionId: approved.id,
      expectedVersion: approved.version,
    });
    a = await req(path(a) + '/submit', 'POST', { expectedVersion: a.version });
    let b = await req(`/artifacts/${r.artifactId}/revisions`, 'POST', {
      revisionId: approved.id,
      expectedVersion: approved.version,
    });
    b = await req(path(b) + '/submit', 'POST', { expectedVersion: b.version });
    const results = await Promise.all([
      fetch(base + '/api/v1' + path(a) + '/approve', {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ expectedVersion: a.version }),
      }),
      fetch(base + '/api/v1' + path(b) + '/approve', {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ expectedVersion: b.version }),
      }),
    ]);
    assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
    assert.deepEqual(await req(path(approved)), approved);
    r = (await results.find((x) => x.status === 200).json()).data;
  });
  await check('固定版本依赖、影响范围、上游替换派生 stale', async () => {
    script = await req(
      `/projects/${p.id}/artifacts`,
      'POST',
      { type: 'script', text: '引用研究版本的文稿', inputRevisionIds: [r.id] },
      randomUUID(),
      201,
    );
    script = await req(path(script) + '/submit', 'POST', { expectedVersion: script.version });
    script = await req(path(script) + '/approve', 'POST', { expectedVersion: script.version });
    assert.ok((await req(path(r) + '/impact')).downstreamRevisionIds.includes(script.id));
    let next = await req(`/artifacts/${r.artifactId}/revisions`, 'POST', {
      revisionId: r.id,
      expectedVersion: r.version,
    });
    next = await req(path(next) + '/submit', 'POST', { expectedVersion: next.version });
    await req(path(next) + '/approve', 'POST', { expectedVersion: next.version });
    const w = await req(workflowPath);
    assert.ok(w.staleRevisionIds.includes(script.id));
    assert.equal((await req(path(script))).status, 'approved');
  });
  let mockJobId;
  await check('异步 Mock 202 / jobId、幂等、取消与重试，保留固定输入', async () => {
    const key = randomUUID();
    const a = await req(
      `/projects/${p.id}/research-runs`,
      'POST',
      { inputRevisionIds: [] },
      key,
      202,
    );
    assert.deepEqual(
      await req(`/projects/${p.id}/research-runs`, 'POST', { inputRevisionIds: [] }, key, 202),
      a,
    );
    mockJobId = a.jobId;
    const before = await req(`/jobs/${a.jobId}`);
    assert.equal(before.state, 'queued');
    const cancelled = await req(`/jobs/${a.jobId}/cancel`, 'POST', {
      expectedVersion: before.version,
    });
    assert.equal(cancelled.state, 'cancelled');
    const retried = await req(`/jobs/${a.jobId}/retry`, 'POST', {
      expectedVersion: cancelled.version,
    });
    assert.deepEqual(retried.inputRevisionIds, before.inputRevisionIds);
    assert.equal((await req(`/jobs/${a.jobId}/events`)).events.length, 3);
  });
  await check('权限/非法输入/跨项目依赖/缺少幂等键有真实阻断', async () => {
    assert.equal((await fetch(base + '/api/v1' + workflowPath)).status, 401);
    assert.equal(
      (
        await fetch(base + '/api/v1' + path(r) + '/approve', {
          method: 'POST',
          headers: { ...headers, Origin: 'https://evil.example' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + '/api/v1' + `/projects/${p.id}/research-runs`, {
          method: 'POST',
          headers,
          body: '{}',
        })
      ).status,
      400,
    );
    const other = await req(
      '/projects',
      'POST',
      {
        title: '隔离项目',
        prompt: 'other',
        targetDurationMs: 30000,
        width: 1080,
        height: 1920,
        entryType: 'script',
        voiceMode: 'tts',
        budgetLimit: { currency: 'CNY', amount: 0 },
      },
      randomUUID(),
      201,
    );
    otherProjectId = other.id;
    await req(
      `/projects/${other.id}/artifacts`,
      'POST',
      { type: 'script', text: 'invalid', inputRevisionIds: [r.id] },
      randomUUID(),
      404,
    );
    await req(
      path(r),
      'PATCH',
      { expectedVersion: r.version, text: '', mock: false },
      randomUUID(),
      400,
    );
  });
  let providerJobId;
  await check('未配置配音提供方只排入真实任务，不生成音频', async () => {
    let draft = await req(
      `/projects/${otherProjectId}/artifacts`,
      'POST',
      { type: 'script', text: '用户自带文稿', inputRevisionIds: [] },
      randomUUID(),
      201,
    );
    draft = await req(path(draft) + '/submit', 'POST', { expectedVersion: draft.version });
    await req(path(draft) + '/approve', 'POST', { expectedVersion: draft.version });
    const w = await req(`/projects/${otherProjectId}/workflow`);
    const voice = w.jobs.find((j) => j.kind === 'voice');
    assert.equal(voice.provider, 'unconfigured');
    assert.equal(voice.resultRevisionId, null);
    providerJobId = voice.id;
  });
  await mkdir(evidenceDir, { recursive: true });
  const out = {
    status: 'PASS',
    at: new Date().toISOString(),
    backend,
    projectId: p.id,
    mockJobId,
    providerJobId,
    checks,
  };
  await writeFile(
    resolve(evidenceDir, `workflow-http-${backend}.json`),
    JSON.stringify(out, null, 2),
  );
  return out;
}
if (process.env.STUDIO_WORKFLOW_HTTP === '1')
  await workflowAcceptance(
    process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3004',
    process.env.STUDIO_TEST_BACKEND || 'sqlite',
    resolve('docs/evidence/phase01'),
  );

import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
const checks = [];
async function check(name, work) {
  await work();
  checks.push({ name, status: 'PASS' });
  console.log(`PASS ${name}`);
}
const page = await fetch(base + '/projects/new');
assert.equal(page.status, 200);
const cookie = page.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
const brief = {
  title: '验收 · 30 秒主题项目',
  prompt: '解释 GPU 如何并行计算',
  targetDurationMs: 30000,
  width: 1080,
  height: 1920,
  fps: 30,
  language: 'zh-CN',
  entryType: 'topic',
  voiceMode: 'tts',
  budgetLimit: { currency: 'CNY', amount: 50 },
};
let first, second, uploaded;
await check('会话 cookie 使用 HttpOnly / SameSite=Strict', async () => {
  assert.match(page.headers.get('set-cookie'), /httponly/i);
  assert.match(page.headers.get('set-cookie'), /samesite=strict/i);
});
await check('无会话 API 返回 401', async () =>
  assert.equal((await fetch(base + '/api/v1/projects')).status, 401),
);
await check('伪造会话返回 401', async () =>
  assert.equal(
    (await fetch(base + '/api/v1/projects', { headers: { Cookie: 'studio_session=forged' } }))
      .status,
    401,
  ),
);
await check('跨站写入和缺少 Origin 返回 403', async () => {
  for (const origin of ['https://evil.example', ''])
    assert.equal(
      (
        await fetch(base + '/api/v1/projects', {
          method: 'POST',
          headers: { ...headers, Origin: origin },
          body: JSON.stringify(brief),
        })
      ).status,
      403,
    );
});
await check('30 秒真实创建返回 201 和永久 UUID', async () => {
  const r = await fetch(base + '/api/v1/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify(brief),
  });
  const b = await r.json();
  assert.equal(r.status, 201, JSON.stringify(b));
  first = b.data;
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.ok(b.meta.requestId);
});
await check('240 秒横屏已有文稿 / 无口播真实保存', async () => {
  const r = await fetch(base + '/api/v1/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...brief,
      title: '验收 · 240 秒文稿项目',
      targetDurationMs: 240000,
      width: 1920,
      height: 1080,
      entryType: 'script',
      voiceMode: 'none',
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 201, JSON.stringify(b));
  second = b.data;
});
await check('刷新详情及列表保留两种时长', async () => {
  for (const p of [first, second]) {
    const r = await fetch(base + `/api/v1/projects/${p.id}`, { headers });
    assert.equal((await r.json()).data.targetDurationMs, p.targetDurationMs);
  }
  const list = (await (await fetch(base + '/api/v1/projects', { headers })).json()).data;
  assert.ok(list.some((p) => p.id === first.id));
  assert.ok(list.some((p) => p.id === second.id));
});
await check('空 Prompt / 非正数 / 非法比例 / 额度 / 错误 JSON', async () => {
  for (const patch of [
    { prompt: '  ' },
    { targetDurationMs: 0 },
    { targetDurationMs: -2 },
    { targetDurationMs: 1.1 },
    { width: 100, height: 100 },
    { budgetLimit: { currency: 'CNY', amount: -1 } },
  ]) {
    const r = await fetch(base + '/api/v1/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...brief, ...patch }),
    });
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.ok((await r.json()).error.code);
  }
  assert.equal(
    (await fetch(base + '/api/v1/projects', { method: 'POST', headers, body: '{bad json' })).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + '/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...brief, targetDurationMs: 3600001 }),
      })
    ).status,
    429,
  );
});
await check('保存修改成功，旧版本写入返回 409', async () => {
  const r = await fetch(base + `/api/v1/projects/${first.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      expectedVersion: 1,
      title: '验收 · 已保存修改',
      budgetLimit: { currency: 'CNY', amount: 88 },
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.data.version, 2);
  assert.equal(b.data.budgetLimit.amount, 88);
  const stale = await fetch(base + `/api/v1/projects/${first.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ expectedVersion: 1, title: '不应覆盖' }),
  });
  assert.equal(stale.status, 409);
});
await check('上传起点：原件保存、哈希、受保护下载内容一致', async () => {
  const form = new FormData();
  form.set(
    'brief',
    JSON.stringify({
      ...brief,
      title: '验收 · 上传资料项目',
      entryType: 'upload',
      voiceMode: 'import',
    }),
  );
  form.append('files', new Blob(['真实测试资料：GPU'], { type: 'text/plain' }), '资料.txt');
  const r = await fetch(base + '/api/v1/projects', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base },
    body: form,
  });
  const b = await r.json();
  assert.equal(r.status, 201, JSON.stringify(b));
  uploaded = b.data;
  const file = uploaded.input.attachments[0];
  assert.equal(file.sha256.length, 64);
  const url = base + `/api/v1/projects/${uploaded.id}/uploads/${file.id}`;
  assert.equal((await fetch(url)).status, 401);
  const download = await fetch(url, { headers });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.equal(await download.text(), '真实测试资料：GPU');
  assert.equal(
    (await fetch(base + `/api/v1/projects/${first.id}/uploads/${file.id}`, { headers })).status,
    404,
  );
});
await check('伪装文件被拒绝且不创建项目', async () => {
  const before = (await (await fetch(base + '/api/v1/projects', { headers })).json()).data.length;
  const form = new FormData();
  form.set('brief', JSON.stringify(brief));
  form.append('files', new Blob(['fake image']), 'fake.png');
  const r = await fetch(base + '/api/v1/projects', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base },
    body: form,
  });
  assert.equal(r.status, 400);
  const after = (await (await fetch(base + '/api/v1/projects', { headers })).json()).data.length;
  assert.equal(after, before);
});
await check('多个文件总量超限 1 字节也返回 413 且不创建项目', async () => {
  const before = (await (await fetch(base + '/api/v1/projects', { headers })).json()).data.length;
  const form = new FormData();
  form.set('brief', JSON.stringify(brief));
  form.append('files', new Blob(['x'.repeat(5 * 1024 * 1024)]), 'first.txt');
  form.append('files', new Blob(['x'.repeat(5 * 1024 * 1024 + 1)]), 'second.txt');
  const r = await fetch(base + '/api/v1/projects', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base },
    body: form,
  });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error.code, 'UPLOAD_LIMIT');
  const after = (await (await fetch(base + '/api/v1/projects', { headers })).json()).data.length;
  assert.equal(after, before);
});
await check('10 个真实页面路由及深链接返回 200', async () => {
  for (const path of [
    '/projects/new',
    `/projects/${first.id}`,
    ...['research', 'script', 'voice', 'storyboard', 'assets', 'motion', 'review', 'export'].map(
      (s) => `/projects/${first.id}/${s}`,
    ),
  ]) {
    const r = await fetch(base + path, { headers });
    const html = await r.text();
    assert.equal(r.status, 200, path);
    assert.match(html, /AI Code Video Studio/);
    assert.doesNotMatch(html, /暂时无法载入/);
  }
});
await check('9 个模拟工作区与真实项目隔离', async () => {
  for (const stage of [
    'overview',
    'research',
    'script',
    'voice',
    'storyboard',
    'assets',
    'motion',
    'review',
    'export',
  ]) {
    const r = await fetch(base + '/demo/' + stage, { headers });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /模拟/);
  }
  const list = (await (await fetch(base + '/api/v1/projects', { headers })).json()).data;
  assert.ok(!list.some((p) => p.id === 'demo_gpu_explainer'));
});
await check('不存在的 API 项目返回 404，未知页面显示 not-found', async () => {
  assert.equal(
    (await fetch(base + '/api/v1/projects/11111111-1111-4111-8111-111111111111', { headers }))
      .status,
    404,
  );
  const missing = await fetch(base + `/projects/${first.id}/unknown`, { headers });
  const html = await missing.text();
  assert.ok([200, 404].includes(missing.status));
  assert.match(html, /找不到这个项目或页面/);
  assert.match(html, /noindex/);
});
// Next.js streams pages inside loading boundaries: notFound() can keep HTTP 200
// after headers are sent; the missing-content UI and noindex must still be present.
const evidence = resolve('../../docs/evidence');
await mkdir(evidence, { recursive: true });
await writeFile(
  resolve(evidence, 'http-results.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      base,
      mode: 'Real HTTP + local SQLite; no external AI providers',
      checks,
      projectIds: [first.id, second.id, uploaded.id],
    },
    null,
    2,
  ),
);
console.log(`${checks.length} HTTP acceptance checks passed.`);

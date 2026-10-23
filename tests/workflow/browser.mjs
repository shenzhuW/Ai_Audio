import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { chromium } = require('playwright');
const output = resolve(root, 'docs/evidence/phase01/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROMIUM_PATH ? { executablePath: process.env.STUDIO_CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
const network = [];
page.on('requestfailed', (r) => network.push({ url: r.url(), error: r.failure()?.errorText }));
page.on('response', (r) => {
  if (r.request().method() === 'POST') network.push({ url: r.url(), status: r.status() });
});
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3004';
try {
  await page.goto(base + '/projects/new');
  await page.locator('[name=title]').fill('Phase01 浏览器审核 ' + Date.now());
  await page.locator('[name=prompt]').fill('浏览器工作流验收：原始需求。');
  await page.getByRole('button', { name: '创建并保存项目' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  await page.goto(projectUrl + '/research');
  const editor = page.getByRole('textbox', { name: '产物文本', exact: true });
  await editor.fill('第一版手动研究内容，未经过事实核实。');
  await page.getByRole('button', { name: '创建草稿', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '草稿已保存' }).waitFor();
  await page.reload();
  await editor.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="产物文本"]')?.value ===
      '第一版手动研究内容，未经过事实核实。',
  );
  await editor.fill('第一版已编辑内容，仍未经过事实核实。');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '草稿已保存' }).waitFor();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByRole('button', { name: '批准当前修订', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '当前修订已批准' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /v1 · 已批准/ }).waitFor();
  assert.equal(await editor.isEditable(), false);
  await page.screenshot({ path: resolve(output, '03-research-approved.png'), fullPage: true });
  await page.getByRole('button', { name: '创建新修订', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('textarea[aria-label="产物文本"]')?.readOnly,
  );
  await editor.fill('第二版内容，准备驳回。');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '草稿已保存' }).waitFor();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.locator('[name=reviewComment]').fill('请补充依据，保留第一版。');
  await page.getByRole('button', { name: '驳回修改', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '修订已驳回' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /v2 · 已驳回/ }).waitFor();
  await page.getByRole('button', { name: /v1 · 已批准/ }).click();
  assert.equal(await editor.inputValue(), '第一版已编辑内容，仍未经过事实核实。');
  assert.equal(await editor.isEditable(), false);
  await page.screenshot({ path: resolve(output, '03-research-history.png'), fullPage: true });
  await page.goto(projectUrl);
  await page.getByRole('heading', { name: '审核与依赖', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, '02-overview.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(projectUrl + '/research');
  await editor.waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'workflow mobile overflow',
  );
  await page.screenshot({ path: resolve(output, '03-research-390.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        status: 'PASS',
        at: new Date().toISOString(),
        base,
        projectUrl,
        checks: [
          'create/save/reload',
          'submit/approve',
          'fork/reject/reload',
          'immutable history',
          'real overview',
          '390px layout',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log('PASS browser workflow save/review/fork/history/refresh/responsive');
} catch (e) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  console.error(
    'Browser failure detail:',
    JSON.stringify({
      url: page.url(),
      alerts: await page.getByRole('alert').allTextContents(),
      network,
      errors,
    }),
  );
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify({ status: 'FAIL', error: String(e), url: page.url(), errors }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(resolve('package.json'));
const { chromium } = require(process.env.PLAYWRIGHT_FROM || 'playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
const output = resolve('../../docs/evidence/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROMIUM_PATH ? { executablePath: process.env.STUDIO_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
const navigationEvents = [];
page.on('response', (r) => {
  if (r.url().includes('/research'))
    navigationEvents.push({ type: 'response', url: r.url(), status: r.status() });
});
page.on('requestfailed', (r) =>
  navigationEvents.push({ type: 'requestfailed', url: r.url(), error: r.failure() }),
);
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) navigationEvents.push({ type: 'navigation', url: f.url() });
});
const runId = Date.now().toString(36);
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/projects/new');
  await page.getByRole('button', { name: '创建并保存项目' }).click();
  await page.getByRole('alert').filter({ hasText: '请检查标注的输入项。' }).waitFor();
  await page.reload();
  await page.locator('[name=title]').fill('浏览器验收 · 30 秒主题');
  await page.locator('[name=prompt]').fill('解释 GPU 并行计算，使用简单例子。');
  await page.locator('[name=duration]').fill('30');
  await page.screenshot({ path: resolve(output, '01-create-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '创建并保存项目' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const first = page.url();
  await page.reload();
  await page.getByText('已持久保存', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, '02-overview-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '编辑项目设置' }).click();
  await page.locator('[name=title]').fill('浏览器验收 · 修改已保存');
  await page.getByRole('button', { name: '保存项目设置' }).click();
  await page.getByText('项目设置已保存', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '浏览器验收 · 修改已保存' }).waitFor();
  // The heading is server rendered; the breadcrumb is populated after Shell hydration.
  await page.locator('header').getByText('浏览器验收 · 修改已保存', { exact: true }).waitFor();
  for (const [i, stage] of [
    'research',
    'script',
    'voice',
    'storyboard',
    'assets',
    'motion',
    'review',
    'export',
  ].entries()) {
    await page
      .locator('nav[aria-label="创作流程"] a[href="' + new URL(first).pathname + '/' + stage + '"]')
      .click();
    await page.waitForURL(first + '/' + stage);
    await page.locator('h1').waitFor();
    await page.screenshot({
      path: resolve(output, `${String(i + 3).padStart(2, '0')}-${stage}.png`),
      fullPage: true,
    });
  }
  await page.goto(base + '/projects/new');
  const scriptTitle = `浏览器验收 · 240 秒文稿 · ${runId}`;
  await page.locator('[name=title]').fill(scriptTitle);
  await page.locator('[name=prompt]').fill('这是已经写好的测试文稿。');
  await page.locator('[name=duration]').fill('4:00');
  await page.locator('[name=aspect]').selectOption('16:9');
  await page.locator('[name=entryType][value=script]').check();
  await page.getByRole('radio', { name: /无口播视频/ }).check();
  await page.getByRole('button', { name: '创建并保存项目' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.reload();
  assert.match(await page.locator('main').innerText(), /04:00/);
  await page.goto(base + '/projects');
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: scriptTitle, exact: true }) })
    .waitFor();
  await page.goto(base + '/projects/new');
  await page.locator('[name=title]').fill(`浏览器验收 · 上传资料 · ${runId}`);
  await page.locator('[name=entryType][value=upload]').check();
  await page.locator('[name=prompt]').fill('依据这份资料说明测试主题。');
  await page.getByRole('radio', { name: /导入已有配音/ }).check();
  await page.getByRole('button', { name: '创建并保存项目' }).click();
  await page.getByRole('alert').filter({ hasText: '请至少选择一个文件' }).waitFor();
  await page.getByLabel('上传参考资料').setInputFiles({
    name: 'browser-reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('浏览器上传的真实测试资料，仅用于验收。'),
  });
  await page.getByRole('button', { name: '创建并保存项目' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.reload();
  await page.getByRole('link', { name: /browser-reference.txt/ }).waitFor();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + '/projects/new');
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(fits, `create overflow at ${width}`);
    await page.screenshot({ path: resolve(output, `01-create-${width}.png`), fullPage: true });
    await page.goto(first);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `02-overview-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        status: 'PASS',
        at: new Date().toISOString(),
        base,
        runId,
        checks: [
          'empty input',
          '30s topic persistence',
          'settings save',
          'navigation across 10 pages',
          '240s script / no narration',
          'upload / imported voice selection',
          '390px and 768px layout',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log('PASS browser create/save/reload/navigation/responsive/screenshots');
} catch (error) {
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        status: 'FAIL',
        at: new Date().toISOString(),
        base,
        url: page.url(),
        error: String(error),
        errors,
      },
      null,
      2,
    ),
  );
  console.error('Browser failure URL:', page.url());
  console.error('Browser failure heading:', await page.locator('h1').allTextContents());
  console.error('Page errors:', errors);
  console.error('Navigation events:', JSON.stringify(navigationEvents));
  throw error;
} finally {
  await browser.close();
}

import { expect, test } from '@playwright/test';
import { installMocks } from './mocks';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mh_onboarding_complete', 'true');
    localStorage.setItem('mh_token', 'demo');
    localStorage.setItem('mh_username', 'DEMO');
    localStorage.setItem('mh_project_slug', 'core-launch');
  });
  await installMocks(page);
});

test('opens the main routes without console errors', async ({ page }) => {
  const routes = ['/', '/projects', '/generation', '/workflows', '/templates', '/profile', '/billing', '/settings'] as const;
  for (const route of routes) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toContainText('Marketing-Hub');
    expect(errors).toEqual([]);
  }
});

test('projects page supports search, view switching, folder creation and selection', async ({ page }) => {
  await page.goto('/projects', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '我的项目与品牌记忆' })).toBeVisible();
  await expect(page.locator('.border').filter({ hasText: 'Core Launch' }).first()).toBeVisible();
  await page.getByPlaceholder('搜索项目', { exact: true }).fill('Core');
  await expect(page.locator('.border').filter({ hasText: 'Core Launch' }).first()).toBeVisible();
  await page.getByTitle('网格').click();
  await page.getByTitle('看板').click();
  await page.getByRole('button', { name: '创建文件夹' }).click();
  await expect(page.getByText('文件夹已创建')).toBeVisible();
  await page.getByRole('button', { name: /^设为当前/ }).first().click();
  await expect(page).toHaveURL(/\/generation$/);
});

test('workflow canvas supports core editing interactions', async ({ page }) => {
  await page.goto('/workflows', { waitUntil: 'networkidle' });
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.getByRole('button', { name: '检索节点' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await page.getByRole('button', { name: '粘贴' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.getByLabel('展开或收起右侧属性面板').click();
  await expect(page.getByText('运行预览')).toBeHidden();
  await page.getByLabel('展开或收起右侧属性面板').click();
  await page.getByRole('button', { name: '只读分享' }).click();
  await expect(page.getByText('只读').first()).toBeVisible();
  await page.getByRole('button', { name: '退出只读' }).click();
  await page.getByRole('button', { name: '保存工作流草稿' }).click();
  await expect(page.getByText('画布草稿已保存')).toBeVisible();
});

test('generation page renders content package and export actions', async ({ page }) => {
  await page.goto('/generation', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '内容包生产' })).toBeVisible();
  await expect(page.getByText('版本：AI 初稿')).toBeVisible();
  await page.getByRole('button', { name: /更短/ }).click();
  await page.getByRole('button', { name: '导出 Markdown' }).click();
  await expect(page.getByText(/Markdown 导出内容已准备好|已复制到剪贴板/)).toBeVisible();
});

import { test, expect } from '@playwright/test';

/**
 * 辅助函数：以 admin 身份登录并等待首页加载
 */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.getByPlaceholder('验证码')).toBeVisible({
    timeout: 15_000
  });

  const code = await page.evaluate(() => {
    const app = document.querySelector('#app') as any;
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    const userStore = pinia?._s?.get('pure-user');
    return userStore?.verifyCode ?? '';
  });

  await page.getByPlaceholder('验证码').fill(code);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/#/**', { timeout: 15_000 });
  await page.waitForLoadState('load');
}

test.describe('组件冒烟', () => {
  test('ReQrcode 二维码 canvas 非空断言', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // 点击 "二维码登录" 按钮切换到二维码登录组件（currentPage = 2）
    await page.getByRole('button', { name: '二维码登录' }).click();

    // ReQrcode 组件渲染的 canvas 应可见
    const qrcodeCanvas = page.locator('.qrcode canvas');
    await expect(qrcodeCanvas).toBeVisible({ timeout: 10_000 });

    // canvas 尺寸非零（qrcode 库已绘制内容）
    const box = await qrcodeCanvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('ReCropperPreview 挂载冒烟——用户管理页面可达渲染', async ({ page }) => {
    await loginAsAdmin(page);

    // 导航到系统管理 → 用户管理（该页面使用 ReCropperPreview 组件）
    const systemMenu = page.locator('.el-menu').first().getByText('系统管理');
    await systemMenu.click();
    const userMenu = page.locator('.el-menu').first().getByText('用户管理');
    await userMenu.click();
    await page.waitForLoadState('load');

    // 用户管理页面成功渲染（表格可见即代表页面可达）
    await expect(page.locator('.el-table').first()).toBeVisible({
      timeout: 10_000
    });
  });
});

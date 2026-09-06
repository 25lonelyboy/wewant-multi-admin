import { test, expect } from '@playwright/test';
import { ADMIN_USER, ADMIN_PASS, readVerifyCode } from './helpers';

test('直连真实后端登录→首页菜单→退出 @real-backend', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.getByPlaceholder('账号')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('账号').fill(ADMIN_USER);
  await page.getByPlaceholder('密码').fill(ADMIN_PASS);
  // 后端无验证码校验，照填前端 canvas 生成的 4 位码
  const code = await readVerifyCode(page);
  await page.getByPlaceholder('验证码').fill(code);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/#/**', { timeout: 15_000 });
  await expect(page.locator('.el-menu').first()).toBeVisible({
    timeout: 10_000
  });
  await page.locator('.el-dropdown-link').last().click();
  await page.getByText('退出系统').click();
  await page.waitForURL('**/#/login', { timeout: 10_000 });
  await expect(page.locator('.login-container')).toBeVisible();
});

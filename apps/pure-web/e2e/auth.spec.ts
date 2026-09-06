import { test, expect } from '@playwright/test';
import { fillAndSubmitLogin } from './helpers';

test.describe('登录链路', () => {
  test('表单空校验 → 填写凭证 → 登录成功 → 首页菜单渲染 → 退出回到登录页 @mock-only', async ({
    page
  }) => {
    // 1. 打开登录页
    await page.goto('/');
    await page.waitForLoadState('load');
    // 等待登录表单渲染
    await expect(page.getByPlaceholder('账号')).toBeVisible({
      timeout: 15_000
    });

    // 2. 表单空校验：清空用户名后触发 blur，应出现错误提示
    const usernameInput = page.getByPlaceholder('账号');
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.fill('');
    await usernameInput.blur();
    await expect(page.locator('.el-form-item__error').first()).toBeVisible();

    // 3. 填写凭证 + 验证码并提交
    await fillAndSubmitLogin(page);

    // 5. 等待跳转到首页（hash 路由）
    await page.waitForURL('**/#/**', { timeout: 15_000 });
    await page.waitForLoadState('load');

    // 6. 验证首页菜单可见（侧边栏至少有一个菜单项）
    await expect(page.locator('.el-menu').first()).toBeVisible({
      timeout: 10_000
    });

    // 7. 退出登录：点击用户头像下拉 → 退出系统
    //    导航栏右侧有用户头像区域，点击后弹出下拉菜单
    await page.locator('.el-dropdown-link').last().click();
    await page.getByText('退出系统').click();

    // 8. 确认回到登录页
    await page.waitForURL('**/#/login', { timeout: 10_000 });
    await expect(page.locator('.login-container')).toBeVisible();
  });
});

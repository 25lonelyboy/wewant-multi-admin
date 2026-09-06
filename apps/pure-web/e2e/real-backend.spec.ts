import { test, expect } from '@playwright/test';
import { readVerifyCode, loginAsAdmin } from './helpers';

const rand = () => Date.now().toString(36).slice(-6);

test('直连真实后端登录→首页菜单→退出 @real-backend', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('.el-menu').first()).toBeVisible({
    timeout: 10_000
  });
  await page.locator('.el-dropdown-link').last().click();
  await page.getByText('退出系统').click();
  await page.waitForURL('**/#/login', { timeout: 10_000 });
  await expect(page.locator('.login-container')).toBeVisible();
});

// NOTE: 选择器（按钮文字、placeholder）为骨架值，Docker 可用后需根据真实 DOM 调整
test('用户管理 CRUD 全链路 @real-backend', async ({ page }) => {
  await loginAsAdmin(page);
  await page.locator('.el-menu').first().getByText('系统管理').click();
  await page.locator('.el-menu').first().getByText('用户管理').click();
  await page.waitForLoadState('load');

  // 增：打开新建对话框，填用户名，提交
  const name = `e2e_user_${rand()}`;
  await page.getByRole('button', { name: '新增' }).click();
  await page.getByPlaceholder('请输入用户名').fill(name);
  await page.getByRole('button', { name: '确定', exact: true }).click();
  // 查：列表出现新用户
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  // 删：删除并断言消失
  await expect(page.getByText(name).first()).toBeHidden({ timeout: 10_000 });
});

// NOTE: localStorage key 对应 src/utils/auth.ts 中导出的 userKey = 'user-info'
test('token 失效自动刷新重试（BizCode 40102 静默轮换） @real-backend', async ({
  page
}) => {
  await loginAsAdmin(page);
  // 篡改 accessToken 为无效值
  await page.evaluate(() => {
    const raw = localStorage.getItem('user-info') ?? '';
    const data = JSON.parse(raw);
    data.accessToken = 'eyJhbGciOiJIUzUxMiJ9.invalid';
    localStorage.setItem('user-info', JSON.stringify(data));
  });
  // 触发需鉴权 API
  await page.locator('.el-menu').first().getByText('系统管理').click();
  await page.locator('.el-menu').first().getByText('用户管理').click();
  // 断言：无登出跳转，列表渲染成功
  await expect(page).toHaveURL(/system\/user/);
  await expect(page.locator('.el-table').first()).toBeVisible({
    timeout: 10_000
  });
});

// NOTE: 此测试必须放在文件最后（会锁定 admin 账号），串行执行时影响后续用例
test('连续错误登录触发账号锁定提示（42301 前端渲染） @real-backend', async ({
  page
}) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  // 连续 5 次错误密码
  for (let i = 0; i < 5; i++) {
    await page.getByPlaceholder('账号').fill('admin');
    await page.getByPlaceholder('密码').fill(`wrong-pass-${i}`);
    const code = await readVerifyCode(page);
    await page.getByPlaceholder('验证码').fill(code);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForTimeout(500);
  }
  // 断言：出现锁定提示
  await expect(page.getByText(/锁定|lock/i).first()).toBeVisible({
    timeout: 10_000
  });
});

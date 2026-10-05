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

// NOTE: 选择器取自页面源码（新增入口 `新增用户`、必填项 `用户昵称/用户名称/用户密码`、
// 行内删除走 el-popconfirm 默认确认按钮），尚未在运行实例上跑过——首次执行需核对实际 DOM。
test('用户管理 CRUD 全链路 @real-backend', async ({ page }) => {
  await loginAsAdmin(page);
  await page.locator('.el-menu').first().getByText('系统管理').click();
  await page.locator('.el-menu').first().getByText('用户管理').click();
  await page.waitForLoadState('load');

  const name = `e2e_user_${rand()}`;

  // 增：打开新增对话框，填三项必填（昵称 / 名称 / 密码），提交
  await page.getByRole('button', { name: '新增用户' }).click();
  const dialog = page.locator('.el-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('请输入用户昵称').fill(`昵称_${rand()}`);
  await dialog.getByPlaceholder('请输入用户名称').fill(name);
  await dialog.getByPlaceholder('请输入用户密码').fill('E2ePass2026');
  await dialog.getByRole('button', { name: '确定', exact: true }).click();

  // 查：列表出现新用户
  const row = page.locator('.el-table__row', { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  // 删：行内删除 → popconfirm 确认 → 断言该行消失
  await row.getByRole('button', { name: '删除' }).click();
  await page
    .locator('.el-popconfirm')
    .getByRole('button', { name: '确定', exact: true })
    .click();
  await expect(page.locator('.el-table__row', { hasText: name })).toHaveCount(
    0,
    { timeout: 10_000 }
  );
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

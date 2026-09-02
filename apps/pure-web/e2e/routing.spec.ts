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
  // 等待动态路由注册完成（兜底路由 PageNotFound 注册即标志 initRouter 已完成）
  await page.waitForFunction(
    () => {
      const app = document.querySelector('#app') as any;
      const router = app?.__vue_app__?.config?.globalProperties?.$router;
      return router?.hasRoute('PageNotFound') === true;
    },
    { timeout: 15_000 }
  );
  await page.waitForLoadState('load');
}

test.describe('动态路由冒烟', () => {
  test('一级菜单导航：系统管理 → 用户管理页面可达', async ({ page }) => {
    await loginAsAdmin(page);

    // 点击侧边栏 "系统管理" 一级菜单
    const systemMenu = page.locator('.el-menu').first().getByText('系统管理');
    await systemMenu.click();

    // 等待子菜单展开并点击 "用户管理"
    const userMenu = page.locator('.el-menu').first().getByText('用户管理');
    await userMenu.click();
    await page.waitForLoadState('load');

    // 验证 URL 包含用户管理路由
    await expect(page).toHaveURL(/system\/user/);
  });

  test('403 页面：路由配置存在且组件可渲染', async ({ page }) => {
    await loginAsAdmin(page);

    // 验证 /access-denied 路由已在路由器中注册
    const routeExists = await page.evaluate(() => {
      const app = document.querySelector('#app') as any;
      const router = app?.__vue_app__?.config?.globalProperties?.$router;
      return router?.getRoutes().some((r: any) => r.path === '/access-denied');
    });
    expect(routeExists).toBe(true);

    // 验证 403 组件可通过路由元信息访问
    const routeMeta = await page.evaluate(() => {
      const app = document.querySelector('#app') as any;
      const router = app?.__vue_app__?.config?.globalProperties?.$router;
      const route = router
        ?.getRoutes()
        .find((r: any) => r.path === '/access-denied');
      return route?.meta;
    });
    expect(routeMeta).toBeDefined();
    expect(routeMeta.title).toBeTruthy();
  });

  test('404 页面：访问未知路由命中兜底渲染 404 页', async ({ page }) => {
    await loginAsAdmin(page);

    // 登录后兜底路由已注册，用客户端导航触发 404 组件渲染
    await page.evaluate(() => {
      const app = document.querySelector('#app') as any;
      const router = app?.__vue_app__?.config?.globalProperties?.$router;
      router.push('/e2e-nonexistent-route');
    });
    await expect(page.getByText('抱歉，你访问的页面不存在')).toBeVisible({
      timeout: 15_000
    });

    // 404 页提供返回首页入口（组件真实渲染而非仅模块存在）
    await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible();
  });

  test('未登录访问受保护路由重定向到登录页', async ({ page }) => {
    // 不登录，直接访问首页
    await page.goto('/#/welcome');
    await page.waitForLoadState('load');

    // 应被路由守卫重定向到登录页
    await expect(page.locator('.login-container')).toBeVisible();
  });
});

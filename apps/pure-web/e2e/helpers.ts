import { expect, type Page } from '@playwright/test';

export const E2E_MODE = process.env.E2E_MODE ?? 'mock';
export const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
export const ADMIN_PASS =
  E2E_MODE === 'real'
    ? (process.env.E2E_ADMIN_PASS ?? 'dev-admin-pass')
    : (process.env.E2E_ADMIN_PASS ?? 'admin123');

export async function readVerifyCode(page: Page): Promise<string> {
  const code = await page.evaluate(() => {
    const app = document.querySelector('#app') as any;
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    const userStore = pinia?._s?.get('pure-user');
    return userStore?.verifyCode ?? '';
  });
  expect(code).toMatch(/^\d{4}$/);
  return code;
}

export async function fillAndSubmitLogin(page: Page): Promise<void> {
  await page.getByPlaceholder('账号').fill(ADMIN_USER);
  await page.getByPlaceholder('密码').fill(ADMIN_PASS);
  const code = await readVerifyCode(page);
  await page.getByPlaceholder('验证码').fill(code);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.getByPlaceholder('验证码')).toBeVisible({
    timeout: 15_000
  });
  await fillAndSubmitLogin(page);
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

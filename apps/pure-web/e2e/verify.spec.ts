import { test, expect } from '@playwright/test';

test.describe('验证码与打印', () => {
  test('验证码 canvas 渲染 + 点击刷新', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // 1. 验证码 canvas 已渲染（ReImageVerify 组件在登录表单的 append 插槽中）
    const canvas = page.locator('form canvas').first();
    await expect(canvas).toBeVisible();

    // 2. canvas 有实际绘制内容（宽高非零）
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // 3. 记录当前验证码
    const codeBefore = await page.evaluate(() => {
      const app = document.querySelector('#app') as any;
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
      return pinia?._s?.get('pure-user')?.verifyCode ?? '';
    });
    expect(codeBefore).toMatch(/^\d{4}$/);

    // 4. 点击 canvas 刷新验证码（多次点击直到验证码变化）
    let codeAfter = codeBefore;
    for (let i = 0; i < 10; i++) {
      await canvas.click();
      await page.waitForTimeout(200);
      codeAfter = await page.evaluate(() => {
        const app = document.querySelector('#app') as any;
        const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
        return pinia?._s?.get('pure-user')?.verifyCode ?? '';
      });
      if (codeAfter !== codeBefore) break;
    }

    // 5. 验证码已更新（4位数字，与之前不同）
    expect(codeAfter).toMatch(/^\d{4}$/);
    expect(codeAfter).not.toBe(codeBefore);
  });

  test('Print 工具模块可加载（行为级冒烟）', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // Print 工具通过创建 iframe 实现打印，此处仅验证模块可动态导入且构造函数可调用
    const result = await page.evaluate(async () => {
      try {
        // 动态导入 Print 模块（Vite dev server 支持此语法）
        const mod = await import('/src/utils/print.ts');
        const Print = mod.default;
        // 创建临时 DOM 元素用于初始化
        const el = document.createElement('div');
        el.id = 'e2e-print-test';
        el.textContent = 'test';
        document.body.appendChild(el);
        // 调用 Print（工厂模式，无需 new）
        Print(el);
        document.body.removeChild(el);
        // 等待 iframe 创建后清理
        const iframe = document.getElementById('myIframe');
        if (iframe) iframe.remove();
        return true;
      } catch {
        return false;
      }
    });

    expect(result).toBe(true);
  });
});

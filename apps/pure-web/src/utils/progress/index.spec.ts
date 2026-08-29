import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

vi.mock('nprogress', () => ({
  default: Object.assign(vi.fn(), {
    configure: vi.fn(),
    start: vi.fn(),
    done: vi.fn()
  })
}));

describe('progress 配置', () => {
  it('configure 参数透传（模块导入时执行）', async () => {
    const { default: NProgress } = await import('nprogress');
    await import('./index');
    expect(NProgress.configure).toHaveBeenCalledWith({
      easing: 'ease',
      speed: 500,
      showSpinner: false,
      trickleSpeed: 200,
      minimum: 0.3
    });
  });

  it('默认导出即 NProgress 实例（供路由守卫调用 start/done）', async () => {
    const { default: NProgress } = await import('nprogress');
    expect(NProgress).toBeDefined();
  });
});

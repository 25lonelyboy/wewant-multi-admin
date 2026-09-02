// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// HTTP 边界 + i18n 展示层 mock（对齐 RePerms 口径）；user store 走真实 pinia 实现
vi.mock('@/api/user', () => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));
vi.mock('@/router', () => ({
  router: {
    currentRoute: { value: { meta: {} } }
  }
}));

import { perms } from './index';
import { useUserStoreHook } from '@/store/modules/user';

function createEl() {
  const parent = document.createElement('div');
  const child = document.createElement('button');
  child.textContent = 'child';
  parent.appendChild(child);
  document.body.appendChild(parent);
  return { parent, child, cleanup: () => parent.remove() };
}

const mounted = (perms as any).mounted!;

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('v-perms directive', () => {
  it('有权限时保留元素', () => {
    useUserStoreHook().$patch({ permissions: ['system:add'] });
    const { child, cleanup } = createEl();
    mounted(child, { value: 'system:add' } as any, null as any, null as any);
    expect(child.parentNode).toBeTruthy();
    cleanup();
  });

  it('无权限时从 DOM 移除元素', () => {
    useUserStoreHook().$patch({ permissions: ['system:add'] });
    const { child, parent, cleanup } = createEl();
    mounted(child, { value: 'system:del' } as any, null as any, null as any);
    expect(child.parentNode).not.toBe(parent);
    cleanup();
  });

  it('*:*:* 超管通配——任意权限均保留', () => {
    useUserStoreHook().$patch({ permissions: ['*:*:*'] });
    const { child, cleanup } = createEl();
    mounted(
      child,
      { value: 'anything:at:all' } as any,
      null as any,
      null as any
    );
    expect(child.parentNode).toBeTruthy();
    cleanup();
  });

  it('数组值全包含才保留；空 permissions 移除', () => {
    useUserStoreHook().$patch({ permissions: ['a', 'b'] });
    const { child: c1, cleanup: cleanup1 } = createEl();
    mounted(c1, { value: ['a', 'b'] } as any, null as any, null as any);
    expect(c1.parentNode).toBeTruthy();
    cleanup1();

    const { child: c2, cleanup: cleanup2 } = createEl();
    mounted(c2, { value: ['a', 'c'] } as any, null as any, null as any);
    expect(c2.parentNode).toBeNull();
    cleanup2();

    useUserStoreHook().$patch({ permissions: [] });
    const { child: c3, cleanup: cleanup3 } = createEl();
    mounted(c3, { value: 'a' } as any, null as any, null as any);
    expect(c3.parentNode).toBeNull();
    cleanup3();
  });

  it('无 value 抛出错误', () => {
    useUserStoreHook().$patch({ permissions: ['a'] });
    const { child, cleanup } = createEl();
    expect(() =>
      mounted(child, { value: undefined } as any, null as any, null as any)
    ).toThrow('[Directive: perms]: need perms!');
    cleanup();
  });
});

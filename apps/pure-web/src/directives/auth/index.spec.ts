// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 阻断 @/router/index.ts 的 createRouter 副作用
vi.mock('@/router', () => ({
  router: {
    currentRoute: { value: { meta: {} as Record<string, unknown> } }
  }
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({})
}));
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => ({})
}));
vi.mock('@/api/routes', () => ({
  getAsyncRoutes: vi.fn(() => Promise.resolve({ code: 0, data: [] }))
}));

import { auth } from './index';
import { router } from '@/router';

const setMetaAuths = (auths: Array<string>) => {
  (router.currentRoute.value.meta as Record<string, unknown>).auths = auths;
};

/** 创建挂载到 DOM 的元素 */
function createEl() {
  const parent = document.createElement('div');
  const child = document.createElement('button');
  child.textContent = 'child';
  parent.appendChild(child);
  document.body.appendChild(parent);
  return { parent, child, cleanup: () => parent.remove() };
}

const mounted = (auth as any).mounted!;

beforeEach(() => {
  (router.currentRoute.value.meta as Record<string, unknown>) = {};
});

describe('v-auth directive', () => {
  it('有权限时保留元素', () => {
    setMetaAuths(['system:add']);
    const { child, cleanup } = createEl();
    mounted(child, { value: 'system:add' } as any, null as any, null as any);
    expect(child.parentNode).toBe(document.querySelector('div'));
    cleanup();
  });

  it('无权限时从 DOM 移除元素', () => {
    setMetaAuths(['system:add']);
    const { child, parent, cleanup } = createEl();
    mounted(child, { value: 'system:del' } as any, null as any, null as any);
    expect(child.parentNode).not.toBe(parent);
    cleanup();
  });

  it('数组值——全部命中才保留', () => {
    setMetaAuths(['system:add', 'system:edit']);
    const { child: c1, cleanup: cleanup1 } = createEl();
    mounted(
      c1,
      { value: ['system:add', 'system:edit'] } as any,
      null as any,
      null as any
    );
    expect(c1.parentNode).toBeTruthy();
    cleanup1();

    const { child: c2, cleanup: cleanup2 } = createEl();
    mounted(
      c2,
      { value: ['system:add', 'system:del'] } as any,
      null as any,
      null as any
    );
    expect(c2.parentNode).toBeNull();
    cleanup2();
  });

  it('无 value 抛出错误', () => {
    setMetaAuths(['system:add']);
    const { child, cleanup } = createEl();
    expect(() =>
      mounted(child, { value: undefined } as any, null as any, null as any)
    ).toThrow('[Directive: auth]: need auths!');
    cleanup();
  });

  it('无 meta.auths 时移除元素', () => {
    const { child, parent, cleanup } = createEl();
    mounted(child, { value: 'system:add' } as any, null as any, null as any);
    expect(child.parentNode).not.toBe(parent);
    cleanup();
  });
});

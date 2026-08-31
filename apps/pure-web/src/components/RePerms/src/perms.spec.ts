// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// HTTP 边界 + i18n 展示层 mock（延续 B2 口径）；user store 走真实实现
vi.mock('@/api/user', () => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));
// 阻断 @/router/index.ts 的 createRouter 副作用（经 @/store/modules/user
// → ../utils → @/router 传递链触发）
vi.mock('@/router', () => ({
  router: {
    currentRoute: { value: { meta: {} } }
  }
}));

import Perms from './perms';
import { useUserStoreHook } from '@/store/modules/user';

/** 组件 value prop 类型为 type:undefined / default:[]，需绕过严格推导 */
const p = (value: string | string[]): Record<string, unknown> => ({ value });

beforeEach(() => {
  useUserStoreHook().$reset();
});

describe('Perms', () => {
  it('命中 permissions：渲染子内容；未命中不渲染', () => {
    useUserStoreHook().$patch({ permissions: ['system:add'] });
    const ok = mount(Perms, {
      props: p('system:add'),
      slots: { default: '<button>add</button>' }
    });
    expect(ok.text()).toContain('add');
    const no = mount(Perms, {
      props: p('system:del'),
      slots: { default: 'del' }
    });
    expect(no.text()).toBe('');
  });

  it('*:*:* 超管通配：任意值均渲染', () => {
    useUserStoreHook().$patch({ permissions: ['*:*:*'] });
    const wrapper = mount(Perms, {
      props: p('anything:at:all'),
      slots: { default: 'ok' }
    });
    expect(wrapper.text()).toBe('ok');
  });

  it('数组值全包含才渲染；空 permissions 拒绝', () => {
    useUserStoreHook().$patch({ permissions: ['a', 'b'] });
    expect(
      mount(Perms, {
        props: p(['a', 'b']),
        slots: { default: 'ok' }
      }).text()
    ).toBe('ok');
    expect(
      mount(Perms, {
        props: p(['a', 'c']),
        slots: { default: 'no' }
      }).text()
    ).toBe('');
    useUserStoreHook().$patch({ permissions: [] });
    expect(
      mount(Perms, {
        props: p('a'),
        slots: { default: 'no' }
      }).text()
    ).toBe('');
  });

  it('无默认槽渲染为空', () => {
    useUserStoreHook().$patch({ permissions: ['a'] });
    expect(mount(Perms, { props: p('a') }).text()).toBe('');
  });
});

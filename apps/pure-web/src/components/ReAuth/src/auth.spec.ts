// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// router 实例 mock（形态对齐 B1 router-utils.spec）：阻断 createRouter 副作用，
// 提供可控 currentRoute.value.meta 驱动真实 hasAuth 链；
// 注意 @/utils/auth 保持真实——hasAuth 即被测对象（真实模块仅依赖
// js-cookie + store hooks，jsdom 下可直接加载，禁止整模块 mock）
vi.mock('@/router', () => ({
  router: {
    currentRoute: { value: { meta: {} as Record<string, unknown> } }
  }
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
// 阻断 @/plugins/i18n 的 import.meta.glob YAML 加载（经 @/router/index.ts
// 传递链触发）
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

import Auth from './auth';
import { router } from '@/router';

const setMetaAuths = (auths: Array<string>) => {
  (router.currentRoute.value.meta as Record<string, unknown>).auths = auths;
};

/** 组件 value prop 类型为 type:undefined / default:[]，需绕过严格推导 */
const p = (value: string | string[]): Record<string, unknown> => ({ value });

beforeEach(() => {
  (router.currentRoute.value.meta as Record<string, unknown>) = {};
});

describe('Auth', () => {
  it('授权命中：渲染默认槽子内容', () => {
    setMetaAuths(['system:add']);
    const wrapper = mount(Auth, {
      props: p('system:add'),
      slots: { default: '<button>add-btn</button>' }
    });
    expect(wrapper.text()).toContain('add-btn');
  });

  it('未授权：不渲染任何内容', () => {
    setMetaAuths(['system:add']);
    const wrapper = mount(Auth, {
      props: p('system:del'),
      slots: { default: '<button>del-btn</button>' }
    });
    expect(wrapper.text()).toBe('');
  });

  it('数组值：全部命中才渲染（isIncludeAllChildren 语义）', () => {
    setMetaAuths(['system:add', 'system:edit']);
    const all = mount(Auth, {
      props: p(['system:add', 'system:edit']),
      slots: { default: 'ok' }
    });
    expect(all.text()).toBe('ok');
    const partial = mount(Auth, {
      props: p(['system:add', 'system:del']),
      slots: { default: 'no' }
    });
    expect(partial.text()).toBe('');
  });

  it('无 meta.auths 拒绝；无默认槽渲染为空', () => {
    const wrapper = mount(Auth, {
      props: p('system:add'),
      slots: { default: 'x' }
    });
    expect(wrapper.text()).toBe('');
    setMetaAuths(['system:add']);
    expect(mount(Auth, { props: p('system:add') }).text()).toBe('');
  });
});

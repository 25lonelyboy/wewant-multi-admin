// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

const tagsFake = { multiTags: [] as any[] };
vi.mock('./multiTags', () => ({
  useMultiTagsStoreHook: () => tagsFake
}));

import { storageLocal } from '@pureadmin/utils';
import { userKey } from '@/utils/auth';
import { usePermissionStoreHook } from './permission';
import { constantMenus } from '@/router';

const hook = usePermissionStoreHook;

beforeEach(() => {
  vi.clearAllMocks();
  tagsFake.multiTags = [];
  storageLocal().clear();
  // filterNoPermissionTree 读 storageLocal(userKey).roles——不 seed 时 roles 为空数组，
  // handleWholeMenus 恒返回 []；seed admin 后无 roles 声明的菜单保留（isOneOfArray 缺省放行）
  storageLocal().setItem(userKey, { roles: ['admin'] });
  // usePermissionStoreHook 是函数（无 $state）；重置与直写均在实例上
  hook().$reset();
});

describe('handleWholeMenus', () => {
  it('组装动态路由菜单：filterNoPermissionTree(filterTree(ascending(拼接))) 语义', () => {
    hook().handleWholeMenus([
      {
        path: '/sys',
        name: 'System',
        meta: { title: 'menus.system', rank: 99 },
        children: [
          {
            path: '/sys/user',
            name: 'SystemUser',
            meta: { title: 'menus.systemUser' }
          }
        ]
      }
    ] as any);

    expect(hook().wholeMenus.length).toBeGreaterThan(0);
    expect(hook().wholeMenus).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'System' })])
    );
    // flatteningRoutes 一维化：含静态+动态
    expect(
      hook().flatteningRoutes.some((r: any) => r?.name === 'SystemUser')
    ).toBe(true);
  });

  it('恒定静态菜单由真实 constantMenus 提供', () => {
    expect(constantMenus).toBeInstanceOf(Array);
    expect(constantMenus.length).toBeGreaterThan(0);
  });
});

describe('clearCache', () => {
  it('标签页不存在则倒序删除缓存页', () => {
    tagsFake.multiTags = [
      { name: 'keep', path: '/keep', query: {}, params: {} }
    ];
    hook().cachePageList = ['keep', 'gone'] as string[];
    hook().clearCache();
    expect(hook().cachePageList).toEqual(['keep']);
  });

  it('标签页齐备不清空', () => {
    tagsFake.multiTags = [
      { name: 'a', path: '/a', query: {}, params: {} },
      { name: 'b', path: '/b', query: {}, params: {} }
    ];
    hook().cachePageList = ['a', 'b'] as string[];
    hook().clearCache();
    expect(hook().cachePageList).toEqual(['a', 'b']);
  });
});

describe('cacheOperate', () => {
  it('refresh：移除自身并清理孤儿缓存', () => {
    tagsFake.multiTags = [{ name: 'a', path: '/a', query: {}, params: {} }];
    hook().cachePageList = ['a', 'b'] as string[];
    hook().cacheOperate({ mode: 'refresh', name: 'a' });
    // filter 后剩 ['b']，clearCache 因 'b' 不在 tags 名列表而清除
    expect(hook().cachePageList).toEqual([]);
  });

  it('add：入列', () => {
    hook().cacheOperate({ mode: 'add', name: 'c' });
    expect(hook().cachePageList).toEqual(['c']);
  });

  it('delete：定位删除 + 清理孤儿缓存', () => {
    tagsFake.multiTags = [
      { name: 'a', path: '/a', query: {}, params: {} },
      { name: 'b', path: '/b', query: {}, params: {} }
    ];
    hook().cachePageList = ['a', 'b'] as string[];
    hook().cacheOperate({ mode: 'delete', name: 'a' });
    expect(hook().cachePageList).toEqual(['b']);
    hook().cacheOperate({ mode: 'delete', name: 'x' });
    expect(hook().cachePageList).toEqual(['b']);
  });
});

describe('clearAllCachePage', () => {
  it('清空菜单与缓存页', () => {
    hook().wholeMenus = [{ path: '/x' }] as any;
    hook().cachePageList = ['x'];
    hook().clearAllCachePage();
    expect(hook().wholeMenus).toEqual([]);
    expect(hook().cachePageList).toEqual([]);
  });
});

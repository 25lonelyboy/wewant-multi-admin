// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RouteRecordRaw, RouteComponent } from 'vue-router';
import { reactive } from 'vue';
import { storageLocal } from '@pureadmin/utils';

// —— mock 面（vi.mock 工厂被提升，先于 import 执行）——
// 1. 路由实例（阻断 @/router/index.ts 的 import-time createRouter 副作用）
vi.mock('@/router', () => {
  const rootRoute: { path: string; children: RouteRecordRaw[] } = {
    path: '/',
    children: []
  };
  return {
    router: {
      hasRoute: vi.fn(() => false),
      addRoute: vi.fn(),
      getRoutes: vi.fn(() => [rootRoute]),
      currentRoute: { value: { meta: {} as Record<string, unknown> } },
      options: { routes: [rootRoute] }
    }
  };
});
// 2. pinia store 钩子
const permissionActions = {
  handleWholeMenus: vi.fn(),
  cacheOperate: vi.fn(),
  flatteningRoutes: [] as RouteRecordRaw[],
  wholeMenus: [] as Array<{
    value: unknown;
    children?: Array<{ value: unknown }>;
  }>
};
const multiTagsActions = {
  getMultiTagsCache: false,
  handleTags: vi.fn()
};
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => permissionActions
}));
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => multiTagsActions
}));
// 3. 远端路由接口
vi.mock('@/api/routes', () => ({
  getAsyncRoutes: vi.fn(() => Promise.resolve({ code: 0, data: [] }))
}));
// 4. auth 仅常量消费（阻断 store 链）
vi.mock('@/utils/auth', () => ({ userKey: 'user-info' }));
// 5. vue-router 历史工厂可断言
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    createWebHashHistory: vi.fn((base: string) => ({ base, type: 'hash' })),
    createWebHistory: vi.fn((base: string) => ({ base, type: 'h5' }))
  };
});
// 6. useTimeoutFn 立即回调（断言 handleAliveRoute default 分支）
vi.mock('@vueuse/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@vueuse/core')>();
  return { ...actual, useTimeoutFn: vi.fn((cb: () => void) => cb()) };
});

import {
  ascending,
  filterTree,
  filterChildrenTree,
  isOneOfArray,
  filterNoPermissionTree,
  getParentPaths,
  findRouteByPath,
  formatFlatteningRoutes,
  formatTwoStageRoutes,
  addAsyncRoutes,
  getHistoryMode,
  handleAliveRoute,
  getAuths,
  hasAuth,
  addPathMatch,
  getTopMenu,
  initRouter
} from './utils';
import { router } from './index';
import { setConfig } from '@/config';
import { usePermissionStoreHook } from '@/store/modules/permission';
import { createWebHashHistory, createWebHistory } from 'vue-router';

// 独立测试路由类型：不交叉 RouteRecordRaw（RouteMeta 的 title 必填会使交叉类型 meta: {} 报错），
// meta 全可选；backstage 供 addAsyncRoutes 断言；CustomizeRouteMeta 来自 types/router.d.ts 全局声明
// （Step 2.0 已将其收入 strict include）。
type TestRoute = {
  path: string;
  name?: string;
  redirect?: string;
  component?: RouteComponent | string;
  meta: Partial<CustomizeRouteMeta> & {
    rank?: number;
    backstage?: boolean;
    fixedTag?: boolean;
  };
  children?: TestRoute[];
  parentId?: unknown;
};

const mk = (path: string, extra: Partial<TestRoute> = {}): TestRoute => ({
  path,
  meta: {},
  ...extra
});

const routeWithChildren = (path: string, children: TestRoute[]): TestRoute => ({
  path,
  meta: {},
  children
});

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal().clear();
  setConfig({});
  (router.currentRoute.value.meta as Record<string, unknown>) = {};
});

describe('ascending', () => {
  it('rank 缺失或为 0（非首页）时补 index+2 并升序', () => {
    const routes: Array<{
      meta: { rank?: number };
      path: string;
      name?: string;
    }> = [
      { path: '/a', meta: {} },
      { path: '/', meta: { rank: 1 } },
      { path: '/b', meta: { rank: 0 } }
    ];
    const sorted = ascending(routes as Array<RouteComponent>);
    expect(sorted.map(v => (v as unknown as { path: string }).path)).toEqual([
      '/',
      '/a',
      '/b'
    ]);
    expect((routes[1].meta as { rank?: number }).rank).toBe(2);
    expect((routes[2].meta as { rank?: number }).rank).toBe(4);
  });

  it('存在 parentId 的节点不补 rank', () => {
    const routes: Array<{
      meta: { rank?: number };
      parentId: unknown;
      path: string;
    }> = [
      { parentId: null, path: '/a', meta: { rank: 5 } },
      { parentId: 1, path: '/b', meta: {} }
    ];
    ascending(routes as Array<RouteComponent>);
    expect((routes[1].meta as { rank?: number }).rank).toBeUndefined();
    expect((routes[0].meta as { rank?: number }).rank).toBe(5);
  });
});

describe('filterTree', () => {
  it('过滤 showLink=false 并递归子树', () => {
    const tree: TestRoute[] = [
      mk('/a', { meta: { showLink: false } }),
      routeWithChildren('/b', [
        mk('/b1'),
        mk('/b2', { meta: { showLink: false } })
      ])
    ];
    const result = filterTree(tree as RouteComponent[]);
    expect(result.map((v: any) => v.path)).toEqual(['/b']);
    expect(
      (result[0] as { children: Array<{ path: string }> }).children.map(
        (v: any) => v.path
      )
    ).toEqual(['/b1']);
  });
});

describe('filterChildrenTree', () => {
  it('过滤 children 为空数组的目录并保留有子节点目录', () => {
    const tree: TestRoute[] = [
      routeWithChildren('/empty', []),
      routeWithChildren('/has', [mk('/has1')])
    ];
    const result = filterChildrenTree(tree as RouteComponent[]);
    expect(result.map((v: any) => v.path)).toEqual(['/has']);
  });
});

describe('isOneOfArray', () => {
  it('两数组有交集返回 true，无交集返回 false', () => {
    expect(isOneOfArray(['a', 'b'], ['b', 'c'])).toBe(true);
    expect(isOneOfArray(['a'], ['b'])).toBe(false);
  });

  it('任一参数非数组时返回 true（沿用原宽放语义）', () => {
    expect(isOneOfArray('a' as unknown as Array<string>, ['b'])).toBe(true);
  });
});

describe('filterNoPermissionTree', () => {
  it('按 storage 中 roles 过滤并修剪空目录', () => {
    storageLocal().setItem('user-info', { roles: ['admin'] });
    const tree: TestRoute[] = [
      mk('/a', { meta: { roles: ['admin'] } }),
      routeWithChildren('/b', [
        mk('/b1', { meta: { roles: ['admin'] } }),
        mk('/b2', { meta: { roles: ['user'] } })
      ])
    ];
    const result = filterNoPermissionTree(tree as RouteComponent[]);
    expect(result.map((v: any) => v.path)).toEqual(['/a', '/b']);
    const b = result[1] as { children: Array<{ path: string }> };
    expect(b.children.map((v: any) => v.path)).toEqual(['/b1']);
  });

  it('无角色配置时返回空数组', () => {
    const tree = [mk('/a')];
    expect(filterNoPermissionTree(tree as RouteComponent[])).toEqual([]);
  });
});

describe('getParentPaths', () => {
  it('返回目标节点的父级 path 链', () => {
    const routes = [
      routeWithChildren('/a', [routeWithChildren('/a1', [mk('/a1-1')])])
    ];
    expect(getParentPaths('/a1-1', routes as RouteRecordRaw[])).toEqual([
      '/a',
      '/a1'
    ]);
  });

  it('未命中返回空数组', () => {
    const routes = [mk('/a')];
    expect(getParentPaths('/nope', routes as RouteRecordRaw[])).toEqual([]);
  });

  it('支持自定义查找 key', () => {
    const routes = [routeWithChildren('/a', [mk('/a1', { name: 'n1' })])];
    expect(getParentPaths('n1', routes as RouteRecordRaw[], 'name')).toEqual([
      '/a'
    ]);
  });
});

describe('findRouteByPath', () => {
  it('顶层命中返回路由，未命中返回 null', () => {
    const routes = [mk('/a')];
    expect(findRouteByPath('/a', routes as RouteRecordRaw[])).toMatchObject({
      path: '/a'
    });
    expect(findRouteByPath('/x', routes as RouteRecordRaw[])).toBeNull();
  });

  it('深层命中；响应式代理命中时返回 toRaw 结果', () => {
    const deep = mk('/a/b');
    const routes = [routeWithChildren('/a', [deep])];
    expect(findRouteByPath('/a/b', routes as RouteRecordRaw[])).toMatchObject({
      path: '/a/b'
    });
    const proxy = reactive(routes)[0];
    const found = findRouteByPath('/a/b', proxy.children as RouteRecordRaw[]);
    expect(found).toMatchObject({ path: '/a/b' });
  });
});

describe('formatFlatteningRoutes', () => {
  it('空数组原样返回', () => {
    expect(formatFlatteningRoutes([])).toEqual([]);
  });

  it('两级嵌套拍平为层级树（buildHierarchyTree 注入层级后压平）', () => {
    const routes = [routeWithChildren('/a', [mk('/a1')])];
    const flat = formatFlatteningRoutes(routes as RouteRecordRaw[]);
    expect(flat.map((v: any) => v.path)).toEqual(['/a', '/a1']);
  });
});

describe('formatTwoStageRoutes', () => {
  it('path "/" 建壳，其余并入 children；三级以上拍二级', () => {
    const routes = [mk('/'), mk('/a'), mk('/a/b')];
    const result = formatTwoStageRoutes(routes as RouteRecordRaw[]);
    expect(result).toHaveLength(1);
    expect(
      (result[0] as { children: Array<{ path: string }> }).children.map(
        v => v.path
      )
    ).toEqual(['/a', '/a/b']);
  });

  it('空数组原样返回', () => {
    expect(formatTwoStageRoutes([])).toEqual([]);
  });
});

describe('addAsyncRoutes', () => {
  it('注入 backstage、默认 redirect/name，并按 component 路径匹配 glob 组件', () => {
    const routes = [routeWithChildren('/sys', [mk('/views', { meta: {} })])];
    routes[0].children![0].component =
      '/src/views/login/index.vue' as unknown as RouteComponent;
    const result = addAsyncRoutes(routes as RouteRecordRaw[]);
    const top = result![0] as TestRoute;
    expect(top.meta.backstage).toBe(true);
    expect(top.redirect).toBe('/views');
    expect(top.name).toBe('viewsParent');
    expect(typeof top.component).toBe('function');
  });

  it('meta.frameSrc 时组件指向 IFrame 常量', () => {
    const routes = [
      mk('/frame', { meta: { frameSrc: 'https://example.com' } })
    ];
    const result = addAsyncRoutes(routes as RouteRecordRaw[]);
    expect(typeof result![0].component).toBe('function');
  });
});

describe('getHistoryMode', () => {
  it('无参模式：hash → createWebHashHistory，h5 → createWebHistory', () => {
    getHistoryMode('hash');
    expect(createWebHashHistory).toHaveBeenCalledWith('');
    getHistoryMode('h5');
    expect(createWebHistory).toHaveBeenCalledWith('');
  });

  it('带 base 参数透传', () => {
    getHistoryMode('hash,/admin/');
    expect(createWebHashHistory).toHaveBeenCalledWith('/admin/');
  });
});

describe('handleAliveRoute', () => {
  it('四种 mode 映射 cacheOperate', () => {
    handleAliveRoute(
      { name: 'Home' } as unknown as Parameters<typeof handleAliveRoute>[0],
      'add'
    );
    expect(permissionActions.cacheOperate).toHaveBeenLastCalledWith({
      mode: 'add',
      name: 'Home'
    });
    handleAliveRoute(
      { name: 'Home' } as unknown as Parameters<typeof handleAliveRoute>[0],
      'delete'
    );
    expect(permissionActions.cacheOperate).toHaveBeenLastCalledWith({
      mode: 'delete',
      name: 'Home'
    });
    handleAliveRoute(
      { name: 'Home' } as unknown as Parameters<typeof handleAliveRoute>[0],
      'refresh'
    );
    expect(permissionActions.cacheOperate).toHaveBeenLastCalledWith({
      mode: 'refresh',
      name: 'Home'
    });
  });

  it('缺省模式先 delete 后同步 add（useTimeoutFn 已被 mock 为立即执行）', () => {
    handleAliveRoute({ name: 'X' } as unknown as Parameters<
      typeof handleAliveRoute
    >[0]);
    expect(permissionActions.cacheOperate).toHaveBeenNthCalledWith(1, {
      mode: 'delete',
      name: 'X'
    });
    expect(permissionActions.cacheOperate).toHaveBeenNthCalledWith(2, {
      mode: 'add',
      name: 'X'
    });
  });
});

describe('getAuths / hasAuth', () => {
  it('getAuths 返回当前路由 meta.auths', () => {
    (router.currentRoute.value.meta as Record<string, unknown>).auths = [
      'system:add'
    ];
    expect(getAuths()).toEqual(['system:add']);
  });

  it('hasAuth：空值/无 meta 拒绝；单串与数组判断', () => {
    expect(hasAuth('')).toBe(false);
    expect(hasAuth('system:add')).toBe(false); // 无 meta.auths
    (router.currentRoute.value.meta as Record<string, unknown>).auths = [
      'system:add',
      'system:del'
    ];
    expect(hasAuth('system:add')).toBe(true);
    expect(hasAuth(['system:add', 'x'])).toBe(false);
    expect(hasAuth(['system:add', 'system:del'])).toBe(true);
  });
});

describe('addPathMatch', () => {
  it('未注册时添加 404 路由', () => {
    addPathMatch();
    expect(router.addRoute).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(router.addRoute).mock.calls[0][0] as {
      name: string;
      path: string;
    };
    expect(arg.name).toBe('PageNotFound');
    expect(arg.path).toBe('/:pathMatch(.*)*');
  });
});

describe('getTopMenu', () => {
  it('wholeMenus 空时返回 undefined；含子节点时选中首子/redirect 节点', () => {
    expect(getTopMenu()).toBeUndefined();
    permissionActions.wholeMenus.push({
      value: 'home',
      children: [{ value: 'a' }, { value: 'b', redirect: undefined }]
    } as never);
    const top = getTopMenu();
    expect(vi.mocked(usePermissionStoreHook()).handleWholeMenus).toBe(
      permissionActions.handleWholeMenus
    );
    expect(top).toMatchObject({ value: 'a' });
  });
});

describe('initRouter', () => {
  it('CachingAsyncRoutes 关闭时拉取远端并解析 router', async () => {
    const { getAsyncRoutes } = await import('@/api/routes');
    vi.mocked(getAsyncRoutes).mockResolvedValueOnce({
      code: 0,
      data: [mk('/remote', { meta: {} })]
    } as Awaited<ReturnType<typeof getAsyncRoutes>>);
    await expect(initRouter()).resolves.toBe(router);
    expect(permissionActions.handleWholeMenus).toHaveBeenCalled();
    expect(multiTagsActions.handleTags).toHaveBeenCalledWith(
      'equal',
      expect.any(Array)
    );
  });

  it('本地缓存命中时不再请求远端', async () => {
    setConfig({ CachingAsyncRoutes: true });
    storageLocal().setItem('async-routes', [mk('/cached')]);
    const { getAsyncRoutes } = await import('@/api/routes');
    await expect(initRouter()).resolves.toBe(router);
    expect(getAsyncRoutes).not.toHaveBeenCalled();
  });
});

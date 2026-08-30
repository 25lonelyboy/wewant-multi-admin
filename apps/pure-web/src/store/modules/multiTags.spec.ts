// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

// storageLocal：multiTags 经 ../utils barrel 消费 @pureadmin/utils 的 storageLocal；
// partial mock 保留 isUrl/isEqual/isNumber/isBoolean 等纯函数真实实现（真实组合口径）
const storageFake = vi.hoisted(() => {
  const raw = new Map<string, any>();
  return {
    raw,
    getItem: <T>(k: string) => (raw.get(k) as T | undefined) ?? null,
    setItem: <T>(k: string, v: T) => raw.set(k, v),
    removeItem: (k: string) => raw.delete(k),
    clear: () => raw.clear()
  };
});
vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return { ...actual, storageLocal: () => storageFake };
});

const permissionFake = vi.hoisted(() => ({
  flatteningRoutes: [] as any[]
}));
vi.mock('./permission', () => ({
  usePermissionStoreHook: () => permissionFake
}));

import { setConfig } from '@/config';
import { useMultiTagsStoreHook } from './multiTags';

const hook = useMultiTagsStoreHook;

// 默认 meta 必含 title：push 链 L78 `tagVal?.meta?.title.length === 0` 对 undefined.title 抛 TypeError
const tag = (
  over: Partial<{
    path: string;
    name: any;
    query: object;
    params: object;
    meta: any;
  }> = {}
) => ({
  path: '/p',
  name: 'P',
  query: {},
  params: {},
  meta: { title: 'T' },
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  storageFake.raw.clear();
  permissionFake.flatteningRoutes = [];
  setConfig({ ResponsiveStorageNameSpace: 'responsive-', MaxTagsLevel: 99 });
  hook().$reset();
});

describe('state 初始化双支', () => {
  it('configure 未开启缓存：multiTags = routerArrays + fixedTag 过滤', () => {
    // .env VITE_HIDE_HOME=false → routerArrays 含 welcome 首页标签（非空）
    // 注意：routerArrays 实际内容取决于环境变量，这里只验证 fixedTag 路由被包含
    permissionFake.flatteningRoutes = [
      { path: '/a', meta: { fixedTag: true } },
      { path: '/b', meta: {} }
    ];
    hook().$reset();
    expect(hook().multiTags.length).toBeGreaterThanOrEqual(1);
    expect(hook().multiTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/a', meta: { fixedTag: true } })
      ])
    );
  });

  it('configure 开启缓存：multiTags 从 tags 存储恢复', () => {
    storageFake.raw.set('responsive-configure', { multiTagsCache: true });
    storageFake.raw.set('responsive-tags', [tag({ path: '/cached' })]);
    hook().$reset();
    expect(hook().multiTags).toEqual([tag({ path: '/cached' })]);
    expect(hook().multiTagsCache).toBe(true);
  });
});

describe('multiTagsCacheChange', () => {
  it('true：multiTags 写入 tags 存储', () => {
    hook().multiTags = [tag({ path: '/1' })];
    hook().multiTagsCacheChange(true);
    expect(storageFake.raw.get('responsive-tags')).toEqual([
      tag({ path: '/1' })
    ]);
  });

  it('false：删除 tags 存储', () => {
    storageFake.raw.set('responsive-tags', [tag()]);
    hook().multiTagsCacheChange(false);
    expect(storageFake.raw.has('responsive-tags')).toBe(false);
  });
});

describe('tagsCache', () => {
  it('multiTagsCache=false 时短路不写', () => {
    hook().tagsCache([tag()]);
    expect(storageFake.raw.has('responsive-tags')).toBe(false);
  });

  it('multiTagsCache=true 时写入', () => {
    storageFake.raw.set('responsive-configure', { multiTagsCache: true });
    hook().$reset();
    hook().tagsCache([tag({ path: '/w' })]);
    expect(storageFake.raw.get('responsive-tags')).toEqual([
      tag({ path: '/w' })
    ]);
  });
});

describe('handleTags', () => {
  it('equal：整体覆盖 + cache 联动', () => {
    storageFake.raw.set('responsive-configure', { multiTagsCache: true });
    hook().$reset();
    hook().handleTags('equal', [tag({ path: '/e1' }), tag({ path: '/e2' })]);
    expect(hook().multiTags).toHaveLength(2);
    expect(storageFake.raw.get('responsive-tags')).toHaveLength(2);
  });

  // 早退用例：multiTags 保持初始状态不变
  it('push：hiddenTag 早退', () => {
    const initialLen = hook().multiTags.length;
    hook().handleTags('push', tag({ meta: { title: 'T', hiddenTag: true } }));
    expect(hook().multiTags).toHaveLength(initialLen);
  });

  it('push：外链 name 早退（真实 isUrl 判定）', () => {
    const initialLen = hook().multiTags.length;
    hook().handleTags('push', tag({ name: 'https://example.com' }));
    expect(hook().multiTags).toHaveLength(initialLen);
  });

  it('push：title 空早退', () => {
    const initialLen = hook().multiTags.length;
    hook().handleTags('push', tag({ meta: { title: '' } }));
    expect(hook().multiTags).toHaveLength(initialLen);
  });

  it('push：showLink=false 早退', () => {
    const initialLen = hook().multiTags.length;
    hook().handleTags('push', tag({ meta: { title: 'T', showLink: false } }));
    expect(hook().multiTags).toHaveLength(initialLen);
  });

  it('push：path+query+params 全等去重早退', () => {
    const t = tag({ path: '/dup', query: { a: 1 }, params: { b: 2 } });
    const initialLen = hook().multiTags.length;
    hook().handleTags('push', t);
    // 第二次 push 须保留 title：meta 覆盖为 {} 会在 push 链 L78 抛 TypeError
    hook().handleTags('push', { ...t });
    expect(hook().multiTags).toHaveLength(initialLen + 1); // 初始长度 + /dup
  });

  it('push：dynamicLevel 达上限时替换首个同 path 标签', () => {
    const initialLen = hook().multiTags.length;
    hook().handleTags(
      'push',
      tag({
        path: '/dyn',
        query: { q: 1 },
        meta: { dynamicLevel: 1, title: 'T' }
      })
    );
    hook().handleTags(
      'push',
      tag({
        path: '/dyn',
        query: { q: 2 },
        meta: { dynamicLevel: 1, title: 'T' }
      })
    );
    expect(hook().multiTags).toHaveLength(initialLen + 1); // 初始长度 + 唯一 /dyn
    // 须按 path 定位 /dyn
    const dynTag = hook().multiTags.find(t => t.path === '/dyn');
    expect(dynTag).toBeDefined();
    expect(dynTag.query).toEqual({ q: 2 });
  });

  it('push：MaxTagsLevel 裁剪（push 之后 length 超上限则 splice(1,1)）', () => {
    // 源码在 push 之后检查 getConfig().MaxTagsLevel——上限须在 push 前生效
    setConfig({ MaxTagsLevel: 2 });
    hook().handleTags('push', tag({ path: '/m1' }));
    hook().handleTags('push', tag({ path: '/m2' }));
    hook().handleTags('push', tag({ path: '/m3' }));
    // 每次 push 后超限删除 index 1（保留首个标签，通常是 fixedTag 或 routerArrays）
    const paths = hook().multiTags.map(t => t.path);
    expect(paths.length).toBe(2);
    expect(paths[paths.length - 1]).toBe('/m3');
  });

  it('splice 无 position：按 path 删除并返回删除后的 multiTags', () => {
    hook().handleTags('equal', [tag({ path: '/s1' }), tag({ path: '/s2' })]);
    const result = hook().handleTags('splice', '/s1');
    expect(result).toHaveLength(1);
    expect(hook().multiTags.map(t => t.path)).toEqual(['/s2']);
  });

  it('splice 无 position：path 不存在时早退返回 undefined', () => {
    hook().handleTags('equal', [tag({ path: '/s1' })]);
    const result = hook().handleTags('splice', '/no-such');
    expect(result).toBeUndefined();
    expect(hook().multiTags).toHaveLength(1);
  });

  it('splice 有 position：按区间删除', () => {
    hook().handleTags('equal', [
      tag({ path: '/r1' }),
      tag({ path: '/r2' }),
      tag({ path: '/r3' })
    ]);
    hook().handleTags('splice', undefined, { startIndex: 0, length: 2 });
    expect(hook().multiTags.map(t => t.path)).toEqual(['/r3']);
  });

  it('slice：返回最后一个标签', () => {
    hook().handleTags('equal', [tag({ path: '/f1' }), tag({ path: '/f2' })]);
    expect(hook().handleTags('slice')).toHaveLength(1);
    expect(hook().handleTags('slice')[0].path).toBe('/f2');
  });
});

# pure-web 测试基建批次 B1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Goal:** 按 [B1 设计](./2026-08-29-pure-web-testing-foundation-b1-design.md) 完成 pure-web 纯函数组 12 模块的 vitest 覆盖（≥80% 行+分支）与 strict 迁移（router/utils、utils/auth、小工具群 7 件、utils/sso、utils/chinaArea），print.ts 走豁免流，全部机制接线保持防漏断言与 `pnpm check` 全绿。

**Architecture:** 串行单 worktree `feat/pure-web-testing-b1`；每子任务节奏 TDD 红→绿→重构 + strict 修复同节奏；验收三件套（模块测试 ≥80% glob 键 / 目标文件+spec strict 零错误迁清单 / 独立提交+文档同提交）。B1.3 的 import 链会把 layout/store 等存量宽松文件拉进 strict program，本批次通过新增「诊断过滤包装脚本」（TS 5.9 无 per-reference `noCheck`，详见 [机制决策](#0-机制决策诊断过滤)）实现严格语义隔离。

**Tech Stack:** vitest 4（独立 vitest.config.ts，`environment: 'node'` 缺省 + 按 spec 用 `@vitest-environment jsdom` pragma）、v8 coverage glob 阈值、TypeScript 5.9（strict via `@multi-admin/tsconfig`）、vue-router / pinia 以 vi.mock 隔离。

**执行前置（worktree）：**

```bash
# superpowers:using-git-worktrees 创建隔离工作区
git worktree add ../pure-web-b1-wt -b feat/pure-web-testing-b1 master
cd ../pure-web-b1-wt
pnpm install
```

---

## 0. 机制决策：诊断过滤

### 0.1 问题

`tsconfig.strict.json` 只 include 清单文件，但 TS 会对 program 内**全部**文件报错（含 import 链拉入的 layout/store/api 等存量宽松文件）。事实校准探针实测：B1 目标 12 模块自身 strict 错误 **65 个**，但整个 program 报错 **487 个**（其余为 lay-tag 37 个等清单外文件的存量错误）。

### 0.2 探索过的方案与结论

| 方案 | 结论 |
| --- | --- |
| TS per-reference `noCheck` | ❌ 事实校准否定：`--noCheck` 是 TS **5.6** 引入的**整项目**跳过开关；5.8/5.9 发布说明均无 per-reference 形式；仓库 pin TS 5.9.3。曾误记为 5.9 特性，已修正 |
| 升级 TypeScript 到支持 per-reference noCheck 的版本 | ⏸ 跨 workspace catalog 变更（影响 nestjs/uni-mobile），超出 B1 范围，作为后续独立决策 |
| 给存量文件加 `@ts-nocheck` | ❌ 污染 194 个文件，语义上把存量区变成「免检区」 |
| 用路径重写把 import 指到 stub d.ts | ❌ stub 类型是 `any`，破坏清单内文件「check against 真实类型」的迁移价值 |
| **诊断过滤包装脚本** | ✅ 采用：跑 vue-tsc 后只保留「清单域内文件」的诊断行，清单外诊断丢弃并计数 |

### 0.3 语义说明

- 不损失既有检查：宽松 `vue-tsc`（tsconfig.json）仍检查全 program（存量宽松代码归它管）；strict 链只管清单域内文件，与「清单语义 = 已迁移文件保持 strict 零错误」的机制设计一致。
- 已知权衡：清单内代码**误用**依赖 API 导致的、位置落在依赖文件的错误会被过滤。缓解：宽松全量检查仍会兜底大部分类型不匹配；清单扩大的过程即闭包缩小过程。未来仓库 TS 升级支持 per-reference `noCheck` 后可移除本脚本（注释留存）。

---

## 文件结构总览

**新建：**

| 文件 | 职责 |
| --- | --- |
| `scripts/check-strict-web.mjs` | strict 诊断过滤包装：spawn vue-tsc → 过滤清单外诊断 → exit code |
| `apps/pure-web/src/router/utils.spec.ts` | B1.3 纯函数簇测试 |
| `apps/pure-web/src/utils/auth.spec.ts` | B1.4 测试 |
| `apps/pure-web/src/utils/{mitt,preventDefault,propTypes,message,responsive}.spec.ts` | B1.5 测试 |
| `apps/pure-web/src/utils/progress/index.spec.ts` | B1.5 测试 |
| `apps/pure-web/src/utils/globalPolyfills.spec.ts` | B1.5 测试 |
| `apps/pure-web/src/utils/sso.spec.ts` | B1.6 测试 |
| `apps/pure-web/src/utils/chinaArea.spec.ts` | B1.6 测试 |
| `apps/pure-web/src/utils/print.spec.ts` | B1.7 薄测试 |
| `apps/pure-web/types/china-area-data.d.ts` | `china-area-data` 包的环境声明（修 TS7016） |

**修改：**

| 文件 | 变更 |
| --- | --- |
| `apps/pure-web/package.json` | typecheck 末段换为 `node ../../scripts/check-strict-web.mjs` |
| `apps/pure-web/src/router/utils.ts` | 21 个 strict 修复（Task 2） |
| `apps/pure-web/src/utils/auth.ts` | 6 个 strict 修复（Task 3） |
| `apps/pure-web/src/utils/preventDefault.ts` | 1 个 strict 修复（Task 4） |
| `apps/pure-web/src/utils/propTypes.ts` | 2 个 override 修复（Task 4） |
| `apps/pure-web/src/utils/sso.ts` | 可测性拆分重构（Task 5） |
| `apps/pure-web/src/utils/chinaArea.ts` | 声明注解类修复（Task 5） |
| `apps/pure-web/tsconfig.strict.json` | include 按序追加（目标文件+spec+声明文件） |
| `apps/pure-web/tsconfig.strict.exemptions.json` | 追加 print.ts 豁免条（Task 6） |
| `apps/pure-web/vitest.config.ts` | coverage.glob 阈值按序追加 |
| `docs/governance/backlog.md` | print.ts 补全项登记（Task 6） |
| `docs/tasks/README.md` 与任务目录索引 | 本计划登记（Task 7） |

---

## 事实校准结果（2026-08-30 实测）

探针（extends tsconfig.strict.json + B1 全部目标文件）实测 **65 个错误**，与 B1 设计估算对照：

| 模块 | 设计估 | 实测 | 判定 |
| --- | --- | --- | --- |
| router/utils.ts | 20 | **21** | +5%，阈值内 |
| utils/auth.ts | 部分 | **6**（TS2345×1 + TS7031×5） | 补全 |
| utils/chinaArea.ts | 20 | **21**（TS7053×11 / 隐式 any×9 / TS7016×1） | +5%，且 TS7053 与隐式 any 数列与设计 2.6 的「9/11」**对调**，按实测执行 |
| utils/print.ts | 13 | **13** | ✓ |
| utils/propTypes.ts | 少量 | 2（TS4114×2） | ✓ |
| utils/sso.ts | 少量 | 1（TS2790，重构后自然消失） | ✓ |
| utils/preventDefault.ts | 少量 | 1（TS7006） | ✓ |
| responsive / message / mitt / progress / globalPolyfills | 0 | **0** | ✓ |

另确认：`ToRouteType` 全局声明在 `types/router.d.ts`（未进 strict 清单导致 TS2304）；`noUncheckedIndexedAccess` 未启用（base.json 注释态），TS2532 均来自可选属性访问而非索引。

---

## Task 1: 机制前置——strict 诊断过滤脚本

**Files:**
- Create: `scripts/check-strict-web.mjs`
- Modify: `apps/pure-web/package.json:12`

- [ ] **Step 1.1: 创建过滤脚本**

```javascript
// 用途：TS 5.9 无 per-reference noCheck（`--noCheck` 为 TS 5.6 起的整项目跳过开关）。
// tsconfig.strict.json 的 include 仅含已迁移清单文件，但 TS 会对 program 内所有文件报错
// （import 链拉入的 layout/store 等存量宽松文件）。本脚本运行 vue-tsc 后仅保留
// 「清单 ∪ 豁免」域内文件的诊断行，清单外诊断丢弃并计数——与 assert-strict-manifest.mjs
// 的「新文件 ⊆ 清单 ∪ 豁免」口径成对。
// 未来仓库 TypeScript 升级至支持 per-reference `noCheck` 的版本后可移除本脚本。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'apps', 'pure-web');
const strict = JSON.parse(
  readFileSync(path.join(APP, 'tsconfig.strict.json'), 'utf8')
);
const exemptions = JSON.parse(
  readFileSync(path.join(APP, 'tsconfig.strict.exemptions.json'), 'utf8')
);

// 将 include 条目与豁免 glob 归一化为小写前缀：exact 命中 或 `前缀/` 命中
const prefixes = [...strict.include, ...exemptions.files].map(p =>
  p.toLowerCase().replace(/\/+$/, '').replace(/\/\*\*$/, '')
);
const inScope = file => {
  const rel = file.replace(/\\/g, '/').toLowerCase();
  return prefixes.some(p => rel === p || rel.startsWith(`${p}/`));
};

const res = spawnSync(
  'pnpm',
  ['exec', 'vue-tsc', '-p', 'tsconfig.strict.json', '--noEmit', '--skipLibCheck'],
  {
    cwd: APP,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }
  }
);

const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
const kept = [];
let dropped = 0;
// vue-tsc 相对 cwd 输出，形如 `src/router/utils.ts(63,11): error TS7008: ...`
const ERROR_RE = /^([^(]+\((\d+),(\d+)\)): (error TS\d+): (.+)$/;
for (const line of output.split(/\r?\n/)) {
  const m = line.match(ERROR_RE);
  if (!m) {
    if (line.trim()) kept.push(line); // 非诊断行（汇总信息等）原样保留
    continue;
  }
  if (inScope(m[1].slice(0, m[1].indexOf('(')))) {
    kept.push(line);
  } else {
    dropped++;
  }
}

if (kept.length > 0) {
  process.stdout.write(kept.join('\n') + '\n');
  process.stderr.write(
    `check-strict-web: 清单域内存在 ${kept.length} 条诊断（另滤除清单外诊断 ${dropped} 条）。\n`
  );
  process.exit(1);
} else {
  process.stdout.write(
    `check-strict-web: strict 清单零错误（滤除清单外存件诊断 ${dropped} 条）。\n`
  );
}
```

- [ ] **Step 1.2: typecheck 末段切换为过滤脚本**

`apps/pure-web/package.json` 第 12 行，将：

```json
    "typecheck": "tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck && cross-env NODE_OPTIONS=--max-old-space-size=8192 vue-tsc -p tsconfig.strict.json --noEmit --skipLibCheck",
```

改为：

```json
    "typecheck": "tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck && node ../../scripts/check-strict-web.mjs",
```

- [ ] **Step 1.3: 验证脚本在现状下通过（清单 6 项零错误，滤除量 > 0）**

Run: `node scripts/check-strict-web.mjs`
Expected: exit 0，输出含 `strict 清单零错误（滤除清单外存件诊断 N 条）` 且 `N > 0`（证明过滤生效）。

- [ ] **Step 1.4: 提交**

```bash
git add scripts/check-strict-web.mjs apps/pure-web/package.json
git commit -m "build(internal): strict 检查接入诊断过滤包装脚本，隔离清单外依赖存量错误"
```

---

## Task 2: B1.3 `router/utils.ts` 纯函数簇

**Files:**
- Create: `apps/pure-web/src/router/utils.spec.ts`
- Modify: `apps/pure-web/src/router/utils.ts`（21 处修复）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `types/router.d.ts` + 目标文件 + spec）
- Modify: `apps/pure-web/vitest.config.ts`（追加 glob 键）

- [ ] **Step 2.0: 写在最前——`types/router.d.ts` 进清单**

TS2304（`Cannot find name 'ToRouteType'`）根因是全局声明文件 `types/router.d.ts` 不在 strict 清单。在 `apps/pure-web/tsconfig.strict.json` 的 `types/global.d.ts` 后追加一行：

```json
    "types/router.d.ts",
```

- [ ] **Step 2.1: 写测试（TDD 红：先建文件，严格类型标注保证自身 strict 干净）**

```typescript
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
  wholeMenus: [] as Array<{ value: unknown; children?: Array<{ value: unknown }> }>
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

type TestRoute = RouteRecordRaw & {
  meta: { rank?: number; showLink?: boolean; roles?: Array<string>; frameSrc?: string; auths?: Array<string>; fixedTag?: boolean };
};

const mk = (path: string, extra: Partial<TestRoute> = {}): TestRoute => ({
  path,
  meta: {},
  ...extra
});

const routeWithChildren = (
  path: string,
  children: TestRoute[]
): TestRoute => ({ path, meta: {}, children: children as RouteRecordRaw[] });

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal().clear();
  setConfig({});
  (router.currentRoute.value.meta as Record<string, unknown>) = {};
});

describe('ascending', () => {
  it('rank 缺失或为 0（非首页）时补 index+2 并升序', () => {
    const routes: Array<{ meta: { rank?: number }; path: string; name?: string }> = [
      { path: '/a', meta: {} },
      { path: '/', meta: { rank: 1 } },
      { path: '/b', meta: { rank: 0 } }
    ];
    const sorted = ascending(routes as Array<RouteComponent>);
    // '/' rank=1 恒第一；'/b'（rank 0 且 path!=/）补 0+2=2；'/a' 缺省补 1+2=3
    expect(sorted.map(v => (v as unknown as { path: string }).path)).toEqual(['/', '/b', '/a']);
    expect((routes[0].meta as { rank?: number }).rank).toBe(3);
  });

  it('存在 parentId 的空参不赋值直接参与排序', () => {
    const routes: Array<{ meta: { rank?: number }; parentId: unknown; path: string }> = [
      { parentId: null, path: '/a', meta: { rank: 5 } },
      { parentId: 1, path: '/b', meta: {} }
    ];
    const sorted = ascending(routes as Array<RouteComponent>);
    expect(sorted.map(v => (v as unknown as { path: string }).path)).toEqual(['/b', '/a']);
    // 有 parentId 的节点不补 rank（保持 undefined），排序按 undefined < 5
    expect((routes[1].meta as { rank?: number }).rank).toBeUndefined();
  });
});

describe('filterTree', () => {
  it('过滤 showLink=false 并递归子树', () => {
    const tree: TestRoute[] = [
      mk('/a', { meta: { showLink: false } }),
      routeWithChildren('/b', [mk('/b1'), mk('/b2', { meta: { showLink: false } })])
    ];
    const result = filterTree(tree as RouteComponent[]);
    expect(result.map(v => v.path)).toEqual(['/b']);
    expect(((result[0] as { children: Array<{ path: string }> }).children).map(v => v.path)).toEqual(['/b1']);
  });
});

describe('filterChildrenTree', () => {
  it('过滤 children 为空数组的目录并保留有子节点目录', () => {
    const tree: TestRoute[] = [
      routeWithChildren('/empty', []),
      routeWithChildren('/has', [mk('/has1')])
    ];
    const result = filterChildrenTree(tree as RouteComponent[]);
    expect(result.map(v => v.path)).toEqual(['/has']);
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
      routeWithChildren('/b', [mk('/b1', { meta: { roles: ['admin'] } }), mk('/b2', { meta: { roles: ['user'] } })])
    ];
    const result = filterNoPermissionTree(tree as RouteComponent[]);
    expect(result.map(v => v.path)).toEqual(['/a', '/b']);
    const b = result[1] as { children: Array<{ path: string }> };
    expect(b.children.map(v => v.path)).toEqual(['/b1']);
  });

  it('无角色配置时返回空数组', () => {
    const tree = [mk('/a')];
    expect(filterNoPermissionTree(tree as RouteComponent[])).toEqual([]);
  });
});

describe('getParentPaths', () => {
  it('返回目标节点的父级 path 链', () => {
    const routes = [routeWithChildren('/a', [routeWithChildren('/a1', [mk('/a1-1')])])];
    expect(getParentPaths('/a1-1', routes as RouteRecordRaw[])).toEqual(['/a', '/a1']);
  });

  it('未命中返回空数组', () => {
    const routes = [mk('/a')];
    expect(getParentPaths('/nope', routes as RouteRecordRaw[])).toEqual([]);
  });

  it('支持自定义查找 key', () => {
    const routes = [routeWithChildren('/a', [mk('/a1', { name: 'n1' })])];
    expect(getParentPaths('n1', routes as RouteRecordRaw[], 'name')).toEqual(['/a']);
  });
});

describe('findRouteByPath', () => {
  it('顶层命中返回路由，未命中返回 null', () => {
    const routes = [mk('/a')];
    expect(findRouteByPath('/a', routes as RouteRecordRaw[])).toMatchObject({ path: '/a' });
    expect(findRouteByPath('/x', routes as RouteRecordRaw[])).toBeNull();
  });

  it('深层命中；响应式代理命中时返回 toRaw 结果', () => {
    const deep = mk('/a/b');
    const routes = [routeWithChildren('/a', [deep])];
    expect(findRouteByPath('/a/b', routes as RouteRecordRaw[])).toMatchObject({ path: '/a/b' });
    const proxy = reactive(routes)[0];
    const found = findRouteByPath('/a', proxy.children as RouteRecordRaw[]);
    expect(found).toMatchObject({ path: '/a' });
  });
});

describe('formatFlatteningRoutes', () => {
  it('空数组原样返回', () => {
    expect(formatFlatteningRoutes([])).toEqual([]);
  });

  it('两级嵌套拍平为层级树（buildHierarchyTree 注入层级后压平）', () => {
    const routes = [routeWithChildren('/a', [mk('/a1')])];
    const flat = formatFlatteningRoutes(routes as RouteRecordRaw[]);
    expect(flat.map(v => v.path)).toEqual(['/a', '/a1']);
  });
});

describe('formatTwoStageRoutes', () => {
  it('path "/" 建壳，其余并入 children；三级以上拍二级', () => {
    const routes = [mk('/'), mk('/a'), mk('/a/b')];
    const result = formatTwoStageRoutes(routes as RouteRecordRaw[]);
    expect(result).toHaveLength(1);
    expect((result[0] as { children: Array<{ path: string }> }).children.map(v => v.path)).toEqual(['/a', '/a/b']);
  });

  it('空数组原样返回', () => {
    expect(formatTwoStageRoutes([])).toEqual([]);
  });
});

describe('addAsyncRoutes', () => {
  it('注入 backstage、默认 redirect/name，并按 component 路径匹配 glob 组件', () => {
    const routes = [
      routeWithChildren('/sys', [mk('/views', { meta: {} })])
    ];
    routes[0].children![0].component = '/src/views/login/index.vue' as unknown as RouteComponent;
    const result = addAsyncRoutes(routes as RouteRecordRaw[]);
    const top = result![0] as TestRoute;
    expect(top.meta.backstage).toBe(true);
    expect(top.redirect).toBe('/views');
    expect(top.name).toBe('viewsParent');
    expect(typeof top.component).toBe('function');
  });

  it('meta.frameSrc 时组件指向 IFrame 常量', () => {
    const routes = [mk('/frame', { meta: { frameSrc: 'https://example.com' } })];
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
    handleAliveRoute({ name: 'Home' } as unknown as Parameters<typeof handleAliveRoute>[0], 'add');
    expect(permissionActions.cacheOperate).toHaveBeenLastCalledWith({ mode: 'add', name: 'Home' });
    handleAliveRoute({ name: 'Home' } as unknown as Parameters<typeof handleAliveRoute>[0], 'delete');
    expect(permissionActions.cacheOperate).toHaveBeenLastCalledWith({ mode: 'delete', name: 'Home' });
    handleAliveRoute({ name: 'Home' } as unknown as Parameters<typeof handleAliveRoute>[0], 'refresh');
    expect(permissionActions.cacheOperate).toHaveBeenLastCalledWith({ mode: 'refresh', name: 'Home' });
  });

  it('缺省模式先 delete 后同步 add（useTimeoutFn 已被 mock 为立即执行）', () => {
    handleAliveRoute({ name: 'X' } as unknown as Parameters<typeof handleAliveRoute>[0]);
    expect(permissionActions.cacheOperate).toHaveBeenNthCalledWith(1, { mode: 'delete', name: 'X' });
    expect(permissionActions.cacheOperate).toHaveBeenNthCalledWith(2, { mode: 'add', name: 'X' });
  });
});

describe('getAuths / hasAuth', () => {
  it('getAuths 返回当前路由 meta.auths', () => {
    (router.currentRoute.value.meta as Record<string, unknown>).auths = ['system:add'];
    expect(getAuths()).toEqual(['system:add']);
  });

  it('hasAuth：空值/无 meta 拒绝；单串与数组判断', () => {
    expect(hasAuth('')).toBe(false);
    expect(hasAuth('system:add')).toBe(false); // 无 meta.auths
    (router.currentRoute.value.meta as Record<string, unknown>).auths = ['system:add', 'system:del'];
    expect(hasAuth('system:add')).toBe(true);
    expect(hasAuth(['system:add', 'x'])).toBe(false);
    expect(hasAuth(['system:add', 'system:del'])).toBe(true);
  });
});

describe('addPathMatch', () => {
  it('未注册时添加 404 路由', () => {
    addPathMatch();
    expect(router.addRoute).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(router.addRoute).mock.calls[0][0] as { name: string; path: string };
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
    // 无 redirect：取 children[0]
    const top = getTopMenu();
    expect(vi.mocked(usePermissionStoreHook()).handleWholeMenus).toBe(permissionActions.handleWholeMenus);
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
    expect(multiTagsActions.handleTags).not.toHaveBeenCalled(); // getMultiTagsCache=false 时走缓存推进
  });

  it('本地缓存命中时不再请求远端', async () => {
    setConfig({ CachingAsyncRoutes: true });
    storageLocal().setItem('async-routes', [mk('/cached')]);
    const { getAsyncRoutes } = await import('@/api/routes');
    await expect(initRouter()).resolves.toBe(router);
    expect(getAsyncRoutes).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2: 运行确认失败（测试尚未实现不可测函数 + 模块本身无 strict 修复前仍可载入）**

Run: `pnpm --filter @multi-admin/pure-web run test -- src/router/utils.spec.ts`
Expected: import 链因 `@/router` `@/store/*` `@/api/routes` mock 化而成功加载；测试通过与否不作门槛，**关键验证点是 `import.meta.glob` 在 vitest 下生效**（addAsyncRoutes 用例中 component 为函数），若 glob 失效立即回报（设计风险表第一项）。

补充验证 import.meta.glob 生效：

Run: `pnpm --filter @multi-admin/pure-web run test -- src/router/utils.spec.ts -t 'addAsyncRoutes'`
Expected: 2 passed（glob 键匹配真实 views 目录）。

- [ ] **Step 2.3: strict 修复 `src/router/utils.ts`（21 处）**

逐个替换：

1. L45/L51/L58-64 `ascending` 系类型标注（消除调用链 any）——L45 `arr.forEach((v, index) => {` 的 v 隐式 any 因入参 `arr: any[]` 合法；保持 `arr: any[]` 不动，仅修下列报告位：

```typescript
// L57-66 filterTree（L63 TS7008）
    (v: { children?: RouteComponent[] }) =>
      v.children && (v.children = filterTree(v.children))
// L69-75 filterChildrenTree（L72 TS7008）
    (v: { children?: RouteComponent[] }) =>
      v.children && (v.children = filterTree(v.children))
```

2. `getParentPaths`（L106 TS7053）：

```typescript
      if ((item as Record<string, unknown>)[key] === value) return parents;
```

3. `findRouteByPath`（L124 TS7023 / L132 TS2532 / L134 TS2345）整体替换：

```typescript
function findRouteByPath(
  path: string,
  routes: RouteRecordRaw[]
): RouteRecordRaw | null {
  let res = routes.find((item: { path: string }) => item.path == path);
  if (res) {
    return isProxy(res) ? toRaw(res) : res;
  } else {
    for (let i = 0; i < routes.length; i++) {
      const children = routes[i].children;
      if (children instanceof Array && children.length > 0) {
        res = findRouteByPath(path, children);
        if (res) {
          return isProxy(res) ? toRaw(res) : res;
        }
      }
    }
    return null;
  }
}
```

4. `handleAsyncRoutes`（L159 TS7006 / L163 TS2345 / L167/174 TS2532 / L176 TS2345 / L177 TS2345 / L193 TS2339）：

```typescript
function handleAsyncRoutes(routeList: RouteRecordRaw[]) {
  if (routeList.length === 0) {
    usePermissionStoreHook().handleWholeMenus(routeList);
  } else {
    const children = router.options.routes[0]?.children ?? [];
    formatFlatteningRoutes(addAsyncRoutes(routeList) ?? []).map(
      (v: RouteRecordRaw) => {
        // 防止重复添加路由
        if (children.findIndex(value => value.path === v.path) !== -1) {
          return;
        } else {
          // 切记将路由push到routes后还需要使用addRoute，这样路由才能正常跳转
          children.push(v);
          // 最终路由进行升序
          ascending(children as unknown as RouteComponent[]);
          if (v.name && !router.hasRoute(v.name)) router.addRoute(v);
          const flattenRouters = router
            .getRoutes()
            .find(n => n.path === '/') as unknown as RouteRecordRaw;
          // 保持router.options.routes[0].children与path为"/"的children一致，防止数据不一致导致异常
          flattenRouters.children = children;
          router.addRoute(flattenRouters);
        }
      }
    );
    usePermissionStoreHook().handleWholeMenus(routeList);
  }
  if (!useMultiTagsStoreHook().getMultiTagsCache) {
    useMultiTagsStoreHook().handleTags('equal', [
      ...routerArrays,
      ...(usePermissionStoreHook().flatteningRoutes.filter(
        (v: RouteRecordRaw) => v?.meta?.fixedTag
      ) as RouteRecordRaw[])
    ]);
  }
  addPathMatch();
}
```

注意：`ascending(children as unknown as RouteComponent[])`——`children` 是 `RouteRecordRaw[]`，`ascending` 入参 `any[]` 时无需断言；若 children 推断为具体类型，直接传即可（执行时按编译报错微调，若 `ascending` 声明 `arr: any[]` 则零断言）。

5. `formatTwoStageRoutes`（L276 TS2532）：

```typescript
      newRoutesList[0]?.children?.push({ ...v });
```

6. `handleAliveRoute`（L283 TS2304 已由 types/router.d.ts 入清单解决——**无需改代码**；若执行时仍报，回查 Step 2.0）。

7. `addAsyncRoutes`（L323 TS18048）：

```typescript
    (v.meta ??= {}).backstage = true;
```

8. `getHistoryMode`（L347 TS7006 / TS2366）：

```typescript
function getHistoryMode(routerHistory: string): RouterHistory {
  // len为1 代表只有历史模式 为2 代表历史模式中存在base参数 https://next.router.vuejs.org/zh/api/#%E5%8F%82%E6%95%B0-1
  const historyMode = routerHistory.split(',');
  const leftMode = historyMode[0];
  const rightMode = historyMode[1];
  // no param
  if (historyMode.length === 1) {
    if (leftMode === 'hash') {
      return createWebHashHistory('');
    } else if (leftMode === 'h5') {
      return createWebHistory('');
    }
  } //has param
  else if (historyMode.length === 2) {
    if (leftMode === 'hash') {
      return createWebHashHistory(rightMode);
    } else if (leftMode === 'h5') {
      return createWebHistory(rightMode);
    }
  }
  throw new Error(`Unsupported router history mode: ${String(routerHistory)}`);
}
```

9. `handleTopMenu`（L386/389 TS7006）：

```typescript
function handleTopMenu(route: menuType): menuType {
  if (route?.children && route.children.length > 1) {
    if (route.redirect) {
      return (
        route.children.filter((cur: menuType) => cur.path === route.redirect)[0]
      );
    } else {
      return route.children[0];
    }
  } else {
    return route;
  }
}
```

10. `getTopMenu`（L401 TS2339）：

```typescript
  const topMenu = handleTopMenu(
    usePermissionStoreHook().wholeMenus[0]?.children?.[0] as menuType
  );
```

- [ ] **Step 2.4: 只跑 strict 链验证域内清零**

Run: `node scripts/check-strict-web.mjs`
Expected: exit 0（此时清单尚未加本模块，清单内 6 项零错误；本模块错误属清单外被滤除——**此步仅验证修复未打扰基线**。域内清零在 Step 2.7 入清单后生效）。

- [ ] **Step 2.5: 测试全绿 + 覆盖率达标**

Run: `pnpm --filter @multi-admin/pure-web run test -- src/router/utils.spec.ts --coverage`
Expected: all passed；`src/router/utils.ts` 行、分支 ≥80%。若不足：补充用例优先覆盖 `handleAsyncRoutes` 的 else 分支细化（children 已含同 path 的重复添加早退）与 `getTopMenu` 的 tag 分支。

- [ ] **Step 2.6: 追加 glob 阈值 + strict 清单收录**

`apps/pure-web/vitest.config.ts` 在 `'src/utils/tree.ts': { lines: 80, branches: 80 }` 后追加：

```typescript
          'src/router/utils.ts': { lines: 80, branches: 80 },
```

`apps/pure-web/tsconfig.strict.json` include 数组追加（保持 `types/router.d.ts` 已加）：

```json
    "src/router/utils.ts",
    "src/router/utils.spec.ts",
```

- [ ] **Step 2.7: 域内清零终验（两个守卫脚本都过）**

Run: `node scripts/check-strict-web.mjs; node scripts/assert-strict-manifest.mjs`
Expected: 双 exit 0；check-strict-web 输出「strict 清单零错误」，滤除量较 Step 2.4 **显著下降**（本模块 21 错误转正为域内后必须已消除——若仍非零按剩余行号修完再回到本步）。

- [ ] **Step 2.8: 提交**

```bash
git add apps/pure-web/src/router/utils.ts apps/pure-web/src/router/utils.spec.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): B1.3 router/utils 纯函数簇测试+strict 迁移（types/router.d.ts 入清单）"
```

---

## Task 3: B1.4 `utils/auth.ts`

**Files:**
- Create: `apps/pure-web/src/utils/auth.spec.ts`
- Modify: `apps/pure-web/src/utils/auth.ts`（6 处修复）
- Modify: `apps/pure-web/tsconfig.strict.json`、`apps/pure-web/vitest.config.ts`

- [ ] **Step 3.0: 写测试**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';

// 设计 2.4：useUserStoreHook 一律 vi.mock；storageLocal 采用真实实现
// （jsdom 提供 localStorage，细化为不 mock，验证面更真）。
const userActions = {
  SET_AVATAR: vi.fn(),
  SET_USERNAME: vi.fn(),
  SET_NICKNAME: vi.fn(),
  SET_ROLES: vi.fn(),
  SET_PERMS: vi.fn()
};
vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => ({ isRemembered: false, loginDay: 7, ...userActions })
}));

import {
  getToken,
  setToken,
  removeToken,
  formatToken,
  hasPerms,
  userKey,
  TokenKey,
  multipleTabsKey,
  type DataInfo
} from './auth';
import { useUserStoreHook } from '@/store/modules/user';

beforeEach(() => {
  vi.clearAllMocks();
  Cookies.remove(TokenKey);
  Cookies.remove(multipleTabsKey);
  storageLocal().clear();
});

const baseData: DataInfo<number> = {
  accessToken: 'a-token',
  refreshToken: 'r-token',
  expires: Date.now() + 3600_000
};

describe('formatToken', () => {
  it('拼接 Bearer 前缀', () => {
    expect(formatToken('abc')).toBe('Bearer abc');
  });
});

describe('getToken', () => {
  it('cookie 优先', () => {
    Cookies.set(TokenKey, JSON.stringify({ accessToken: 'from-cookie', expires: 1, refreshToken: 'r' }));
    expect(getToken()?.accessToken).toBe('from-cookie');
  });

  it('cookie 缺失时回退 localStorage', () => {
    storageLocal().setItem(userKey, { accessToken: 'from-storage' });
    expect(getToken()?.accessToken).toBe('from-storage');
  });

  it('两边均无返回 undefined', () => {
    expect(getToken()).toBeUndefined();
  });
});

describe('setToken', () => {
  it('expires > 0 时按毫秒间隔换算天数写入 cookie', () => {
    const data = { ...baseData, expires: Date.now() + 86400_000 };
    setToken(data);
    const parsed = JSON.parse(Cookies.get(TokenKey) ?? '{}');
    expect(parsed).toMatchObject({ accessToken: 'a-token', refreshToken: 'r-token' });
    expect(parsed.expires).toBe(data.expires);
  });

  it('expires 非正时写会话 cookie', () => {
    setToken({ ...baseData, expires: 0 });
    const parsed = JSON.parse(Cookies.get(TokenKey) ?? '{}');
    expect(parsed).toMatchObject({ accessToken: 'a-token' });
  });

  it('username && roles 齐备：SET_* 与 storage 双写、multiple-tabs 会话 cookie', () => {
    const data = {
      ...baseData,
      username: 'sso-user',
      roles: ['admin'],
      avatar: 'avatars/x.png',
      nickname: '苏',
      permissions: ['system:add']
    };
    setToken(data);
    expect(userActions.SET_AVATAR).toHaveBeenCalledWith('avatars/x.png');
    expect(userActions.SET_USERNAME).toHaveBeenCalledWith('sso-user');
    expect(userActions.SET_ROLES).toHaveBeenCalledWith(['admin']);
    expect(userActions.SET_PERMS).toHaveBeenCalledWith(['system:add']);
    const stored = storageLocal().getItem<DataInfo<number>>(userKey);
    expect(stored?.username).toBe('sso-user');
    expect(Cookies.get(multipleTabsKey)).toBe('true');
  });

  it('username 或 roles 缺失：其余字段从 storage 回读补写', () => {
    storageLocal().setItem(userKey, {
      avatar: 'backup.png',
      username: 'backup-user',
      nickname: '备',
      roles: ['user'],
      permissions: ['x']
    });
    setToken({ ...baseData });
    expect(userActions.SET_AVATAR).toHaveBeenCalledWith('backup.png');
    expect(userActions.SET_USERNAME).toHaveBeenCalledWith('backup-user');
    expect(userActions.SET_ROLES).toHaveBeenCalledWith(['user']);

    const stored = storageLocal().getItem<DataInfo<number>>(userKey);
    expect(stored?.refreshToken).toBe('r-token');
    expect(stored?.avatar).toBe('backup.png');
  });

  it('isRemembered=true 时 multiple-tabs 带 loginDay 过期', () => {
    vi.mocked(useUserStoreHook()).isRemembered = true;
    setToken({ ...baseData });
    const spy = vi.mocked(useUserStoreHook());
    expect(spy.isRemembered).toBe(true);
    // loginDay=7：Cookie 已存在即验证写入成功（options 透传由 js-cookie 内部处理）
    expect(Cookies.get(multipleTabsKey)).toBe('true');
  });
});

describe('removeToken', () => {
  it('清理 cookie 两键与 storage', () => {
    Cookies.set(TokenKey, 'x');
    Cookies.set(multipleTabsKey, 'true');
    storageLocal().setItem(userKey, { accessToken: 'x' });
    removeToken();
    expect(Cookies.get(TokenKey)).toBeUndefined();
    expect(Cookies.get(multipleTabsKey)).toBeUndefined();
    expect(storageLocal().getItem(userKey)).toBeUndefined();
  });
});

describe('hasPerms', () => {
  it('空值/无权限拒绝', () => {
    expect(hasPerms('')).toBe(false);
    storageLocal().clear();
    vi.mocked(useUserStoreHook()).permissions = undefined as unknown as Array<string>;
    expect(hasPerms('system:add')).toBe(false);
    vi.mocked(useUserStoreHook()).permissions = [];
    expect(hasPerms('system:add')).toBe(false);
  });

  it('超级权限通配放行', () => {
    vi.mocked(useUserStoreHook()).permissions = ['*:*:*'];
    expect(hasPerms('anything')).toBe(true);
  });

  it('单值与数组形式（isIncludeAllChildren 语义）', () => {
    vi.mocked(useUserStoreHook()).permissions = ['a', 'sub-b'];
    expect(hasPerms('a')).toBe(true);
    expect(hasPerms('c')).toBe(false);
    expect(hasPerms(['a', 'c'])).toBe(false); // 非全包含
  });
});
```

- [ ] **Step 3.1: 运行确认红（getToken 对 undefined 场景尚可载入，整体先看 import 链）**

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/auth.spec.ts`
Expected: mock 化后 import 成功（`@/store/modules/user` 链被阻断），用例本身先行通过为佳（auth.ts 无行为修改，严格修复仅类型层面）。

- [ ] **Step 3.2: strict 修复（6 处）**

`apps/pure-web/src/utils/auth.ts`：

1. `getToken`（L35-40 TS2345）——两次 `Cookies.get` 调用间 TS 不保留窄化，引入局部变量：

```typescript
export function getToken(): DataInfo<number> {
  // 此处与`TokenKey`相同，此写法解决初始化时`Cookies`中不存在`TokenKey`报错
  const cookie = Cookies.get(TokenKey);
  return cookie ? JSON.parse(cookie) : storageLocal().getItem(userKey);
}
```

2. `setUserKey`（L72 TS7031×5）——解构参数标注为「调用处已保证默认值齐全」的字段集类型：

```typescript
  function setUserKey({
    avatar,
    username,
    nickname,
    roles,
    permissions
  }: {
    avatar: string;
    username: string;
    nickname: string;
    roles: Array<string>;
    permissions: Array<string>;
  }) {
```

（两个调用分支已分别用 `?? ''` / `?? []` 与 storage 回读补齐默认值，签名收紧后无需改动调用处；若执行时 TS 报调用处不匹配，按行号补齐默认值后再回到本步。）

- [ ] **Step 3.3: 测试绿 + 覆盖率达标**

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/auth.spec.ts --coverage`
Expected: all passed；`src/utils/auth.ts` 行、分支 ≥80%。（`DATA` 上 `DataInfo` 接口字段、注释行不计；13 用例已覆盖 setToken 三分支、hasPerms 全分支。不足时补 `getToken` cookie 中 JsonParse 异常等边界。）

- [ ] **Step 3.4: 追加 glob 阈值 + 清单收录**

`vitest.config.ts` glob 追加：

```typescript
          'src/utils/auth.ts': { lines: 80, branches: 80 },
```

`tsconfig.strict.json` include 追加：

```json
    "src/utils/auth.ts",
    "src/utils/auth.spec.ts",
```

- [ ] **Step 3.5: 双守卫验证 + 提交**

Run: `node scripts/check-strict-web.mjs; node scripts/assert-strict-manifest.mjs`
Expected: 双 exit 0；域内 6 诊断清零。

```bash
git add apps/pure-web/src/utils/auth.ts apps/pure-web/src/utils/auth.spec.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): B1.4 utils/auth 测试+strict 迁移"
```

---

## Task 4: B1.5 小工具群（7 模块）

> B1.5 是一个子任务、一个提交；内部按「薄测试模块 → strict 修复模块」顺序推进。验收口径同 B1.3/B1.4（每个模块 glob 键 + 清单条目）。

**Files:**
- Create: `apps/pure-web/src/utils/{mitt,message,responsive,preventDefault,propTypes,globalPolyfills}.spec.ts`、`apps/pure-web/src/utils/progress/index.spec.ts`
- Modify: `apps/pure-web/src/utils/preventDefault.ts`、`apps/pure-web/src/utils/propTypes.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`、`apps/pure-web/vitest.config.ts`

### 4.1 `mitt.ts`（0 错误，node 环境）

- [ ] 写测试：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { emitter } from './mitt';

describe('emitter', () => {
  it('订阅后广播触发处理器并传递载荷', () => {
    const handler = vi.fn();
    emitter.on('openPanel', handler);
    emitter.emit('openPanel', 'panel-x');
    expect(handler).toHaveBeenCalledWith('panel-x');
    emitter.off('openPanel', handler);
  });

  it('解绑后不再触发', () => {
    const handler = vi.fn();
    emitter.on('tagOnClick', handler);
    emitter.off('tagOnClick', handler);
    emitter.emit('tagOnClick', 't');
    expect(handler).not.toHaveBeenCalled();
  });

  it('多处理器各自接收；未知主题无人接收不抛错', () => {
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('logoChange', a);
    emitter.on('logoChange', b);
    emitter.emit('logoChange', true);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
    expect(() => emitter.emit('tagViewsChange', 'x')).not.toThrow();
    emitter.off('logoChange', a);
    emitter.off('logoChange', b);
  });
});
```

### 4.2 `message.ts`（0 错误，node 环境；vi.mock element-plus）

- [ ] 写测试：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { closeAll: vi.fn() })
}));

import { ElMessage } from 'element-plus';
import { message, closeAllMessage } from './message';

const ElMessageMock = ElMessage as unknown as ReturnType<typeof vi.fn> & {
  closeAll: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  ElMessageMock.mockClear();
  ElMessageMock.closeAll.mockClear();
});

describe('message', () => {
  it('无参数对象时走缺省样式', () => {
    message('hi');
    expect(ElMessageMock).toHaveBeenCalledWith({
      message: 'hi',
      customClass: 'pure-message'
    });
  });

  it('参数透传与 antd 风格映射 pure-message', () => {
    message('err', { type: 'error', duration: 5000 });
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', duration: 5000, customClass: 'pure-message' })
    );
  });

  it('customClass=el 时不加 pure-message', () => {
    message('x', { customClass: 'el' });
    expect(ElMessageMock).toHaveBeenCalledWith(expect.objectContaining({ customClass: '' }));
  });
});

describe('closeAllMessage', () => {
  it('调用 ElMessage.closeAll', () => {
    closeAllMessage();
    expect(ElMessageMock.closeAll).toHaveBeenCalledTimes(1);
  });
});
```

### 4.3 `responsive.ts`（0 错误，node 环境；vi.mock responsive-storage）

- [ ] 写测试：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'vue';

const getData = vi.fn();
const install = vi.fn();
vi.mock('responsive-storage', () => ({
  default: { getData, install }
}));

import Storage from 'responsive-storage';
import { injectResponsiveStorage } from './responsive';
import { setConfig } from '@/config';

const StorageMock = Storage as unknown as {
  getData: typeof getData;
  install: typeof install;
};

const makeApp = (): App => ({ use: vi.fn() }) as unknown as App;

beforeEach(() => {
  vi.clearAllMocks();
  setConfig({});
});

describe('injectResponsiveStorage', () => {
  it('Storage 未命中时以 config 缺省值合并', () => {
    StorageMock.getData.mockReturnValue(undefined);
    const app = makeApp();
    injectResponsiveStorage(app, { Locale: 'en', Theme: 'dark' } as PlatformConfigs);
    const [, options] = vi.mocked(app.use).mock.calls[0];
    const memory = (options as { memory: { locale: { locale: string }; layout: { theme: string } } }).memory;
    expect(memory.locale.locale).toBe('en');
    expect(memory.layout.theme).toBe('dark');
    expect(StorageMock.install).toBeDefined();
  });

  it('Storage 命中时优先缓存值', () => {
    StorageMock.getData.mockImplementation((key: string) =>
      key === 'layout' ? { layout: 'horizontal', theme: 'dark' } : undefined
    );
    const app = makeApp();
    injectResponsiveStorage(app, { Locale: 'zh' } as PlatformConfigs);
    const [, options] = vi.mocked(app.use).mock.calls[0];
    const memory = (options as { memory: { layout: { layout: string } } }).memory;
    expect(memory.layout.layout).toBe('horizontal');
  });

  it('MultiTagsCache=true 时并入 tags 键', () => {
    StorageMock.getData.mockReturnValue(undefined);
    const app = makeApp();
    injectResponsiveStorage(app, { MultiTagsCache: true } as PlatformConfigs);
    const [, options] = vi.mocked(app.use).mock.calls[0];
    expect((options as { memory: Record<string, unknown> }).memory).toHaveProperty('tags');
  });
});
```

### 4.4 `preventDefault.ts`（1 错误，jsdom；vi.mock @vueuse/core）

- [ ] 4.4.1 写测试：

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const listeners: Array<(ev: unknown) => void> = [];
vi.mock('@vueuse/core', () => ({
  useEventListener: vi.fn((_t: unknown, _e: string, cb: (ev: unknown) => void) => {
    listeners.push(cb);
  })
}));

import { addPreventDefault } from './preventDefault';

const makeEvent = (props: Record<string, unknown>) =>
  ({ preventDefault: vi.fn(), ...props }) as unknown as KeyboardEvent;

beforeEach(() => {
  listeners.length = 0;
});

describe('addPreventDefault', () => {
  it('注册 keydown/contextmenu/selectstart/dragstart 四个监听', () => {
    addPreventDefault();
    expect(listeners).toHaveLength(4);
  });

  it('F12 触发 preventDefault', () => {
    addPreventDefault();
    const ev = makeEvent({ key: 'F12' });
    listeners[0](ev);
    expect(vi.mocked(ev.preventDefault)).toHaveBeenCalledTimes(1);
  });

  it('非 F12 按键不阻止', () => {
    addPreventDefault();
    const ev = makeEvent({ key: 'Enter' });
    listeners[0](ev);
    expect(vi.mocked(ev.preventDefault)).not.toHaveBeenCalled();
  });

  it('contextmenu/selectstart 无条件阻止', () => {
    addPreventDefault();
    const ev = makeEvent({});
    listeners[1](ev);
    listeners[2](ev);
    expect(vi.mocked(ev.preventDefault)).toHaveBeenCalledTimes(2);
  });

  it('dragstart 仅 img 元素阻止', () => {
    addPreventDefault();
    const img = new Image();
    const divEv = makeEvent({});
    listeners[3](divEv);
    expect(vi.mocked(divEv.preventDefault)).not.toHaveBeenCalled();
    const imgEv = makeEvent({ target: img });
    listeners[3](imgEv);
    expect(vi.mocked(imgEv.preventDefault)).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] 4.4.2 strict 修复（L4 TS7006）：

`apps/pure-web/src/utils/preventDefault.ts`：

```typescript
/** 是否为`img`标签 */
function isImgElement(element: Element | null): boolean {
  return typeof HTMLImageElement !== 'undefined'
    ? element instanceof HTMLImageElement
    : element?.tagName.toLowerCase() === 'img';
}
```

- [ ] 4.4.3 绿 + 覆盖：`pnpm --filter @multi-admin/pure-web run test -- src/utils/preventDefault.spec.ts --coverage`，行分支 ≥80%。

### 4.5 `propTypes.ts`（2 错误，node 环境）

- [ ] 4.5.1 写测试：

```typescript
import { describe, it, expect } from 'vitest';
import propTypes from './propTypes';

describe('propTypes', () => {
  it('基础校验器对类型做运行时判断', () => {
    expect(propTypes.string('x')).toBe(true);
    expect(propTypes.string(42)).toBe(false);
    expect(propTypes.number(1)).toBe(true);
    expect(propTypes.bool(true)).toBe(true);
    expect(propTypes.object({ a: 1 })).toBe(true);
    expect(propTypes.integer(1)).toBe(true);
    expect(propTypes.integer(1.5)).toBe(false);
  });

  it('def() 返回 default 字段', () => {
    const withDefault = propTypes.string.def('fallback');
    expect(withDefault).toMatchObject({ default: 'fallback' });
  });

  it('自定义 style 校验器与 VNodeChild 校验器存在', () => {
    expect(propTypes.style({ color: 'red' })).toBe(true);
    expect(propTypes.style('not-style')).toBe(false);
    expect(propTypes.VNodeChild).toBeDefined();
  });
});
```

- [ ] 4.5.2 strict 修复（L28/L34 TS4114，`noImplicitOverride` 要求）：

`apps/pure-web/src/utils/propTypes.ts` 两处：

```typescript
  static override get style() {
```

```typescript
  static override get VNodeChild() {
```

- [ ] 4.5.3 绿 + 覆盖：`pnpm --filter @multi-admin/pure-web run test -- src/utils/propTypes.spec.ts --coverage`。

### 4.6 `progress/index.ts`（0 错误，node 环境；vi.mock nprogress）

- [ ] 写测试：

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('nprogress', () => ({
  default: Object.assign(vi.fn(), {
    configure: vi.fn(),
    start: vi.fn(),
    done: vi.fn()
  })
}));

import NProgress from 'nprogress';

const NProgressMock = NProgress as unknown as {
  configure: ReturnType<typeof vi.fn>;
};

describe('progress 配置', () => {
  it('configure 参数透传（模块导入时执行）', () => {
    expect(NProgressMock.configure).toHaveBeenCalledWith({
      easing: 'ease',
      speed: 500,
      showSpinner: false,
      trickleSpeed: 200,
      minimum: 0.3
    });
  });

  it('默认导出即 NProgress 实例（供路由守卫调用 start/done）', () => {
    expect(NProgress).toBeDefined();
  });
});
```

注：`import 'nprogress/nprogress.css'` 由 vitest 的 css 模块化处理为空模块，无需 mock。

### 4.7 `globalPolyfills.ts`（0 错误，jsdom）

- [ ] 写测试：

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import './globalPolyfills';

describe('globalPolyfills', () => {
  it('window.global 未定义时指向 window', async () => {
    vi.resetModules();
    (window as unknown as { global: unknown }).global = undefined;
    await import('./globalPolyfills');
    expect((window as unknown as { global: unknown }).global).toBe(window);
  });

  it('已有 window.global 时保持原值', async () => {
    vi.resetModules();
    const marker = { keep: true };
    (window as unknown as { global: unknown }).global = marker;
    await import('./globalPolyfills');
    expect((window as unknown as { global: unknown }).global).toBe(marker);
  });
});
```

### 4.8 统一验收（B1.5）

- [ ] Step 4.8.1: 七个 spec 全绿 + 覆盖达标

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/mitt.spec.ts src/utils/message.spec.ts src/utils/responsive.spec.ts src/utils/preventDefault.spec.ts src/utils/propTypes.spec.ts "src/utils/progress/index.spec.ts" src/utils/globalPolyfills.spec.ts --coverage`
Expected: all passed；7 模块逐一行、分支 ≥80%（薄测试均在模块导入时即执行大部分代码，行覆盖自然达标；不足的分支（如 message.ts 的参数分支）补缺省值/显式值对照用例）。

- [ ] Step 4.8.2: glob + 清单批量追加

`vitest.config.ts` glob 追加：

```typescript
          'src/utils/mitt.ts': { lines: 80, branches: 80 },
          'src/utils/message.ts': { lines: 80, branches: 80 },
          'src/utils/responsive.ts': { lines: 80, branches: 80 },
          'src/utils/preventDefault.ts': { lines: 80, branches: 80 },
          'src/utils/propTypes.ts': { lines: 80, branches: 80 },
          'src/utils/progress/index.ts': { lines: 80, branches: 80 },
          'src/utils/globalPolyfills.ts': { lines: 80, branches: 80 },
```

`tsconfig.strict.json` include 追加：

```json
    "src/utils/mitt.ts",
    "src/utils/mitt.spec.ts",
    "src/utils/message.ts",
    "src/utils/message.spec.ts",
    "src/utils/responsive.ts",
    "src/utils/responsive.spec.ts",
    "src/utils/preventDefault.ts",
    "src/utils/preventDefault.spec.ts",
    "src/utils/propTypes.ts",
    "src/utils/propTypes.spec.ts",
    "src/utils/progress/index.ts",
    "src/utils/progress/index.spec.ts",
    "src/utils/globalPolyfills.ts",
    "src/utils/globalPolyfills.spec.ts",
```

- [ ] Step 4.8.3: 双守卫

Run: `node scripts/check-strict-web.mjs; node scripts/assert-strict-manifest.mjs`
Expected: 双 exit 0。若 responsive/progress/index.spec 等 spec 自身有 strict 诊断，按行号修正（spec 同为清单成员）。

- [ ] Step 4.8.4: 提交

```bash
git add apps/pure-web/src/utils apps/pure-web/src/utils/progress/index.spec.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): B1.5 小工具群 7 模块测试+strict 迁移"
```

---

## Task 5: B1.6 `sso.ts` 可测性重构 + `chinaArea.ts` strict 修复

**Files:**
- Create: `apps/pure-web/src/utils/sso.spec.ts`、`apps/pure-web/src/utils/chinaArea.spec.ts`、`apps/pure-web/types/china-area-data.d.ts`
- Modify: `apps/pure-web/src/utils/sso.ts`（重构）、`apps/pure-web/src/utils/chinaArea.ts`（注解类修复）
- Modify: `apps/pure-web/tsconfig.strict.json`、`apps/pure-web/vitest.config.ts`

### 5.1 `sso.ts` 重构

- [ ] Step 5.1.0: 写测试（TDD 先落测试再重构，红跑在旧实现上以「导出不存在」失败）

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth', () => ({
  removeToken: vi.fn(),
  setToken: vi.fn()
}));

import {
  getSsoParams,
  isSsoLogin,
  buildSsoRedirectUrl,
  handleSsoLogin
} from './sso';
import { removeToken, setToken } from './auth';
import type { DataInfo } from './auth';

const params: DataInfo<number> = {
  username: 'sso',
  roles: 'admin',
  accessToken: 't-1'
} as unknown as DataInfo<number>;

// 结构上与窗口 location 同形的最小假对象：避开 jsdom 导航语义，测试无需 DOM
const fakeLocation = (hash: string) =>
  ({
    href: `http://localhost:8848/#/permission/page/index?username=sso&roles=admin&accessToken=t-1${hash}`,
    origin: 'http://localhost:8848',
    pathname: '/',
    hash,
    replace: vi.fn()
  }) as unknown as Location;

beforeEach(() => vi.clearAllMocks());

describe('getSsoParams', () => {
  it('must 三键齐备且键数恰为 3 时返回参数', () => {
    const url = 'http://x/#/?username=sso&roles=admin&accessToken=t';
    expect(getSsoParams(url)).toEqual(
      expect.objectContaining({ username: 'sso' })
    );
  });

  it('参数量不对或缺失 must 键时返回 null', () => {
    expect(getSsoParams('http://x/#/?username=sso')).toBeNull();
    expect(getSsoParams('http://x/#/?username=sso&roles=admin&other=1&accessToken=t')).toBeNull();
  });
});

describe('isSsoLogin', () => {
  it('null 判 false', () => {
    expect(isSsoLogin(null)).toBe(false);
  });
});

describe('buildSsoRedirectUrl', () => {
  it('剥除 roles/accessToken，username 以 query 保留', () => {
    const loc = fakeLocation('#/permission/page/index');
    expect(buildSsoRedirectUrl(params, loc)).toBe(
      'http://localhost:8848/#/permission/page/index?username=sso'
    );
  });
});

describe('handleSsoLogin', () => {
  it('append 三键时：清旧 + 存新 + replace 跳转', () => {
    const loc = fakeLocation('#/permission/page/index');
    handleSsoLogin(loc);
    expect(removeToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledTimes(1);
    expect(loc.replace).toHaveBeenCalledWith(
      'http://localhost:8848/#/permission/page/index?username=sso'
    );
  });

  it('非单点参数时早退为零副作用', () => {
    const loc = {
      ...fakeLocation('#/login'),
      href: 'http://localhost:8848/#/login'
    } as unknown as Location;
    handleSsoLogin(loc);
    expect(removeToken).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it('无参调用走全局 location（jsdom）且不抛错', () => {
    // 入口副作用已在模块导入时执行一次（无 query → 早退）；此处再调仅验证可调用
    expect(() => handleSsoLogin()).not.toThrow();
  });
});
```

- [ ] Step 5.1.1: 运行确认失败（导出不存在）

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/sso.spec.ts`
Expected: FAIL（`getSsoParams` 等导出不存在 / 入口 IIFE 在 jsdom 导入时执行 `handleSsoLogin()` 未定义）。

- [ ] Step 5.1.2: 重写 `apps/pure-web/src/utils/sso.ts`（保留入口副作用行为零变化）

```typescript
import { removeToken, setToken, type DataInfo } from './auth';
import { subBefore, getQueryMap } from '@pureadmin/utils';

/**
 * 简版前端单点登录，根据实际业务自行编写，平台启动后本地可以跳后面这个链接进行测试 http://localhost:8848/#/permission/page/index?username=sso&roles=admin&accessToken=eyJhbGciOiJIUzUxMiJ9.admin
 * 划重点：
 * 判断是否为单点登录，不为则直接返回不再进行任何逻辑处理，下面是单点登录后的逻辑处理
 * 1.清空本地旧信息；
 * 2.获取url中的重要参数信息，然后通过 setToken 保存在本地；
 * 3.删除不需要显示在 url 的参数
 * 4.使用 window.location.replace 跳转正确页面
 */

const SSO_MUST_KEYS = ['username', 'roles', 'accessToken'] as const;

/** 解析 url 参数；键数恰为 3 且 must 三键齐备时判定为单点登录参数，否则返回 null */
export function getSsoParams(url: string): DataInfo<number> | null {
  const params = getQueryMap(url) as DataInfo<number>;
  const keys = Object.keys(params);
  if (keys.length !== SSO_MUST_KEYS.length) return null;
  const matched = SSO_MUST_KEYS.filter(k => keys.includes(k));
  return matched.length === SSO_MUST_KEYS.length ? params : null;
}

export function isSsoLogin(params: DataInfo<number> | null): params is DataInfo<number> {
  return params !== null;
}

/** 拼接去除 roles/accessToken 后的跳转地址（url 中不再暴露敏感参数） */
export function buildSsoRedirectUrl(
  params: DataInfo<number>,
  loc: Pick<Location, 'origin' | 'pathname' | 'hash'>
): string {
  const { roles: _roles, accessToken: _accessToken, ...rest } = params;
  const query = JSON.stringify(rest)
    .replace(/["{}]/g, '')
    .replace(/:/g, '=')
    .replace(/,/g, '&');
  return `${loc.origin}${loc.pathname}${subBefore(loc.hash, '?')}?${query}`;
}

/** 单点登录主流程：非单点参数早退；命中则清旧 → 存新 → 替换跳转 */
export function handleSsoLogin(loc: Location = window.location): void {
  const params = getSsoParams(loc.href);
  if (!isSsoLogin(params)) return;

  removeToken();
  setToken(params);
  loc.replace(buildSsoRedirectUrl(params, loc));
}

handleSsoLogin();
```

> 行为等价比对：原 IIFE 判「键数 = 3 且 must 全在场」与 `getSsoParams` 等价；跳转串的 JSON 序列化先后替换链原样保留；仅 `delete params.roles/accessToken`（TS2790 报错处）改为解构剥离——剩余键固定为 username（键数=3 且 must 全在场 ⇒ third keys ⊆ must）。

- [ ] Step 5.1.3: 绿 + 覆盖

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/sso.spec.ts --coverage`
Expected: all passed；`src/utils/sso.ts` 行、分支 ≥80%。

### 5.2 `chinaArea.ts` strict 修复 + 测试

- [ ] Step 5.2.0: 新建 `apps/pure-web/types/china-area-data.d.ts`（修 TS7016；三层结构：省代码 → 下级代码 → 名称）

```typescript
declare module 'china-area-data' {
  const REGION_DATA: Record<string, Record<string, string>>;
  export default REGION_DATA;
}
```

- [ ] Step 5.2.1: 写测试（铺底 convertTextToCode 与导出数据形状）

```typescript
import { describe, it, expect } from 'vitest';
import {
  convertTextToCode,
  CodeToText,
  regionData,
  regionDataPlus,
  provinceAndCityData
} from './chinaArea';

describe('convertTextToCode', () => {
  it('省市县三级拼接', () => {
    expect(convertTextToCode('北京市', '市辖区', '朝阳区')).toBe('110000, 110100, 110105');
  });

  it('仅省份时返回省 code', () => {
    expect(convertTextToCode('北京市', '', '')).toBe('110000');
  });

  it('“全部”选项码值为空串', () => {
    expect(convertTextToCode('北京市', '全部', '')).toBe('110000');
  });

  it('未知名返回空串', () => {
    expect(convertTextToCode('不存在省', '不存在市', '不存在区')).toBe('');
  });
});

describe('导出数据形状', () => {
  it('CodeToText 省代码映射名称', () => {
    expect(CodeToText['110000']).toBe('北京市');
    expect(CodeToText['']).toBe('全部');
  });

  it('regionData 为省市扩展结构（顶层省含 children 市）', () => {
    const bj = regionData.find(v => v.value === '110000');
    expect(bj?.label).toBe('北京市');
    expect(bj?.children?.some(c => c.value === '110100')).toBe(true);
  });

  it('regionDataPlus 首位为“全部”哨兵', () => {
    expect(regionDataPlus[0]).toMatchObject({ value: '', label: '全部' });
  });

  it('provinceAndCityData 不含区级 children', () => {
    const bj = provinceAndCityData.find(v => v.value === '110000');
    expect(bj?.children?.[0].children).toBeUndefined();
  });
});
```

- [ ] Step 5.2.2: strict 修复（21 处，机制性：3 个声明注解 + 1 个模块声明文件，一次消除）

`apps/pure-web/src/utils/chinaArea.ts`：

1. L11-L19 声明区（TS7034 L17、TS7053 L23/32/33/36/53/54/57/85/86/165/166 与 TS7005 L42/66/69/126 全部源于这三处声明）：

```typescript
// code转汉字大对象,例：CodeToText['110000']输出北京市
const CodeToText: Record<string, string> = {};
// 汉字转code大对象,例：TextToCode['北京市']['市辖区']['朝阳区'].code输出110105
const TextToCode: Record<string, Record<string, { code: string }>> = {};
// 省份对象
const provinceObject = REGION_DATA['86'];
// 省市区三级联动数据（不带“全部”选项）
const regionData: ProvinceData[] = [];
// 省市二级联动数据（不带“全部”选项）
let provinceAndCityData: ProvinceData[] = [];
```

2. L45（TS7034）与 L55-L57 引用链：

```typescript
  const provinceChildren: ProvinceData[] = [];
```

3. L77（TS7034）：

```typescript
      const cityChildren: ProvinceData[] = [];
```

> 说明：`REGION_DATA['86']` 经模块声明后为 `Record<string, string>`，`provinceData[prop]`、`cityData[prop]` 索引即 string，TS7053 全部消失；`regionData`/`provinceChildren`/`cityChildren` 具名后 TS7005/TS7034 消失。不重构数据结构（设计 2.6）。

- [ ] Step 5.2.3: 绿 + 覆盖

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/chinaArea.spec.ts --coverage`
Expected: all passed；`src/utils/chinaArea.ts` 行、分支 ≥80%（convertTextToCode 全分支已铺；数据构造区随导入执行覆盖。若分支不足补 `regionDataPlus`/`provinceAndCityDataPlus` 形状断言）。

### 5.3 B1.6 统一验收

- [ ] Step 5.3.1: glob + 清单追加

`vitest.config.ts` glob 追加：

```typescript
          'src/utils/sso.ts': { lines: 80, branches: 80 },
          'src/utils/chinaArea.ts': { lines: 80, branches: 80 },
```

`tsconfig.strict.json` include 追加：

```json
    "types/china-area-data.d.ts",
    "src/utils/sso.ts",
    "src/utils/sso.spec.ts",
    "src/utils/chinaArea.ts",
    "src/utils/chinaArea.spec.ts",
```

- [ ] Step 5.3.2: 双守卫 + 宽松 typecheck 联动检查

Run: `node scripts/check-strict-web.mjs; node scripts/assert-strict-manifest.mjs; cd apps/pure-web; pnpm run typecheck`
Expected: 三连 exit 0（宽松链确认 `sso.ts` 重构未惊扰路由线——`src/router/index.ts` 与 `src/main.ts` 对入口副作用的使用保持原语义）。

- [ ] Step 5.3.3: 提交

```bash
git add apps/pure-web/src/utils/sso.ts apps/pure-web/src/utils/sso.spec.ts apps/pure-web/src/utils/chinaArea.ts apps/pure-web/src/utils/chinaArea.spec.ts apps/pure-web/types/china-area-data.d.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): B1.6 sso 可测性拆分重构+chinaArea 测试与 strict 迁移"
```

---

## Task 6: B1.7 `print.ts` 薄测试 + 架构性豁免

**Files:**
- Create: `apps/pure-web/src/utils/print.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.exemptions.json`、`docs/governance/backlog.md`

- [ ] **Step 6.0: 写薄测试（不触发 writeIframe / execCommand 等 jsdom 不可达路径）**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Print from './print';

describe('extendOptions', () => {
  it('浅合并 obj2 到 obj 并返回 obj', () => {
    const p = Object.create(Print.prototype) as { extendOptions: <T>(obj: object, obj2: T) => T };
    const target = { a: 1 };
    const result = p.extendOptions(target, { b: 2, a: 3 });
    expect(result).toBe(target);
    expect(result).toEqual({ a: 3, b: 2 });
  });

  it('缺省 obj2 不改变 obj', () => {
    const p = Object.create(Print.prototype) as { extendOptions: (obj: object, obj2?: object) => object };
    const target = { a: 1 };
    expect(p.extendOptions(target)).toBe(target);
  });
});

describe('conf 合并（构造器）', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="print">Hi</div>';
    vi.spyOn(Print.prototype, 'init').mockImplementation(function (this: unknown) {
      return undefined;
    });
  });

  it('options 同名键覆盖 conf 缺省', () => {
    const printBeforeFn = vi.fn();
    const p = new (Print as unknown as new (dom: string, options?: object) => {
      conf: { styleStr: string; printBeforeFn: unknown; printDoneCallBack: unknown };
    })('#print', { styleStr: '.x{}', printBeforeFn });
    expect(p.conf.styleStr).toBe('.x{}');
    expect(typeof p.conf.printBeforeFn).toBe('function');
    expect(p.conf.printDoneCallBack).toBeNull();
  });

  it('setDomHeightArr 非空时构造器内联动调用 setDomHeight', () => {
    const setDomHeight = vi
      .spyOn(Print.prototype as { setDomHeight: (arr: string[]) => unknown }, 'setDomHeight')
      .mockImplementation(() => undefined);
    new (Print as unknown as new (dom: string, options?: object) => unknown)('#print', {
      setDomHeightArr: ['.a']
    });
    expect(setDomHeight).toHaveBeenCalledWith(['.a']);
  });
});

describe('getStyle', () => {
  it('拼接 style/link outerHTML 与 no-print 遮罩样式', () => {
    document.head.innerHTML = '<style>.a{color:red}</style><link rel="stylesheet">';
    const p = Object.create(Print.prototype) as {
      conf: { styleStr: string };
      getStyle: () => string;
    };
    p.conf = { styleStr: '.hidden{}' };
    const str = p.getStyle();
    expect(str).toContain('.a{color:red}');
    expect(str).toContain('.no-print{display:none;}');
    expect(str).toContain('.hidden{}');
  });
});

describe('isDOM', () => {
  it('HTMLElement 分支判断真实元素', () => {
    const p = Object.create(Print.prototype) as { isDOM: (obj: unknown) => boolean };
    expect(p.isDOM(document.createElement('div'))).toBe(true);
    expect(p.isDOM({})).toBe(false);
  });
});
```

- [ ] **Step 6.1: 绿（薄测试无门槛数值要求，全绿即可）**

Run: `pnpm --filter @multi-admin/pure-web run test -- src/utils/print.spec.ts`
Expected: all passed（7 用例）。

- [ ] **Step 6.2: 豁免清单登记（防漏断言「新文件 ⊆ 清单 ∪ 豁免」）**

`apps/pure-web/tsconfig.strict.exemptions.json`：
- `files` 追加 `"src/utils/print.ts"`（精确文件，非通配）；
- `reason` 追加 ③号句：「③`src/utils/print.ts`：窗口打印依赖 iframe onload、`document.execCommand` 等 jsdom 不可达 API，为架构性豁免（B1.7 薄测试覆盖纯函数部分），待 jsdom 能力或 E2E 基建成熟后回补 strict+覆盖（关联 backlog）。」

- [ ] **Step 6.3: backlog 登记**

`docs/governance/backlog.md` 开放表追加一行：「print.ts strict+覆盖补全 —— 前置：jsdom 可达成 E2E 打印基建；内容：13 处 strict 修复 + writeIframe/toPrint 覆盖补全 + 迁入 strict 清单并撤销豁免」。

- [ ] **Step 6.4: 双守卫 + 提交**

Run: `node scripts/assert-strict-manifest.mjs; node scripts/check-strict-web.mjs`
Expected: 双 exit 0（print.ts 因豁免条目成为域内文件，其 13 个存量诊断被检查器视为域内保留——**注意**：`check-strict-web.mjs` 的域内口径含豁免目录，print.ts 的 13 个错误会令其 exit 1！→ 此处必须给出豁免域诊断过滤语义的裁决：print.ts 属豁免文件，其诊断不属于「清单域内必零错误」承诺范围。执行时若 check-strict-web 报 print.ts 13 错误，将 `check-strict-web.mjs` 的域内口径进一步收窄为「strict include 条目 ± 剥离 spec/类型后缀」……

> **为消除上述咬合问题，机制裁决如下（Task 6 执行时据此落地）：** `check-strict-web.mjs` 的 inScope 只在 `strict.include` 上计算（**不含豁免 glob**）。豁免文件的存量诊断按「清单外」滤除，防漏仍由 `assert-strict-manifest.mjs` 的豁免登记保证。即 Step 6.4 前先修改 `check-strict-web.mjs` 第 2 行附近：

```javascript
// 豁免 glob 不参与「域内必零错误」计算——豁免条目已由 assert-strict-manifest.mjs 登记防漏，
// 其存量 strict 诊断不属于清单承诺范围（如 print.ts 的 jsdom 不可达 API）。
const prefixes = strict.include.map(p =>
  p.toLowerCase().replace(/\/+$/, '').replace(/\/\*\*$/, '')
);
```

```bash
git add apps/pure-web/src/utils/print.spec.ts apps/pure-web/tsconfig.strict.exemptions.json scripts/check-strict-web.mjs docs/governance/backlog.md
git commit -m "test(web): B1.7 print 薄测试+架构性豁免登记，豁免诊断不计入 strict 域内"
```

---

## Task 7: 全局收口与文档治理

**Files:**
- Modify: `docs/tasks/README.md`（或任务目录对应索引）、`docs/tasks/2026-08-29-pure-web-testing-foundation/2026-08-30-pure-web-testing-foundation-b1-plan.md`（本计划自检段落，如执行中校准差异）

- [ ] **Step 7.1: 全量质量门禁**

Run: `pnpm check`（仓库根）
Expected: 全链绿（prettier → typecheck（含新过滤链）→ lint → stylelint → test → 覆盖枚举）。若 lint 对新增 spec 报 warning/error，按 `eslint --fix` 结果修正后重跑。

- [ ] **Step 7.2: B1 全量 vitest 回归**

Run: `pnpm --filter @multi-admin/pure-web run test:coverage`
Expected: 全部 spec（B0 2 个 + B1 12 个）绿；glob 阈值列表共 14 键逐项 ≥80。

- [ ] **Step 7.3: 防漏断言计数确认只增不减**

Run: `node scripts/assert-strict-manifest.mjs`
Expected: exit 0，输出清单 20 项 / 豁免 29 项（相对 B0 基线 6+28 的增量全为本批次合法收录）。

- [ ] **Step 7.4: 文档索引核对（索引登记已于计划定稿时完成）**

核对 `docs/tasks/README.md` 的进行中行收口说明与本批次最终状态一致（开工/进行中/收口），必要时更新；执行中与本的校准差异同步回写本文档（同下提交）。

```bash
git add docs/tasks/README.md docs/tasks/2026-08-29-pure-web-testing-foundation/2026-08-30-pure-web-testing-foundation-b1-plan.md
git commit -m "docs(repo): B1 实施计划登记与任务目录索引更新"
```

- [ ] **Step 7.5: 完成报告（执行会话末）**

汇总：15 提交（Task 1-7 单测链）、14 个 glob 阈值键、strict 清单域 20 项全部零错误、豁免 29 项、`pnpm check` 全绿；对照 B1 设计「统一验收」表逐行打勾；将执行中与计划的偏差回写本计划文档（同 Step 7.4 提交或独立 `docs(web)` 提交）。

---

## 自检清单（计划作者自查，非执行步骤）

**1. 设计覆盖：** B1.3 router/utils ✅（Task 2）；B1.4 auth ✅（Task 3）；B1.5 小工具群 7 件 ✅（Task 4）；B1.6 sso+chinaArea ✅（Task 5）；B1.7 print 豁免流 ✅（Task 6）；归置动作 localforage → B2 ✅（不在本计划，B2 承接）；前置校准 65 errors ✅（事实校准表）。

**2. 无占位符：** 全部修复代码、测试代码、命令、提交信息均已落笔；Task 6 的豁免×过滤咬合已事前裁决，不留「执行时再定」。

**3. 类型一致性：** `getSsoParams`/`isSsoLogin`/`buildSsoRedirectUrl`/`handleSsoLogin` 四导出在 Task 5 测试与实现间一致；`ToRouteType` 依赖 types/router.d.ts 入清单（Task 2 Step 2.0）与 Test 2.1 的 `Parameters<typeof handleAliveRoute>[0]` 用法一致；glob 键与 coverage include 路径形制一致（`src/utils/progress/index.ts` 注意斜杠）。

**4. 已核实的风险前置判断：** `import.meta.glob` 在 vitest 下原生支持（Task 2 首个用例验证）；jsdom pragma 按 spec 精确启用（mitt/message/responsive/propTypes/progress/chinaArea/sso 用 node，其余 DOM 系 6 个用 jsdom）；`(v.meta ??= {})` 为 ES2021 语法、target ESNext 无碍；`keyword override` 由 noImplicitOverride 要求、TS 5.9 支持。

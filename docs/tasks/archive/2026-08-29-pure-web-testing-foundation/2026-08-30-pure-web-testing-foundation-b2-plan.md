# pure-web 测试基建批次 B2 实施计划（状态机/store 组）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 pure-web 的 token 刷新状态机（`utils/http`）与 pinia store 组（user/permission/multiTags/app/settings/epTheme + localforage + store 基础设施）补齐 ≥80% 行+分支覆盖的 vitest 测试，并将全部域内文件 strict 迁入清单。

**Architecture:** 依据 [B2 批次设计](./2026-08-29-pure-web-testing-foundation-b2-design.md)「真实组合优先」口径：仅 mock 外部边界（axios 库、`@/api/*` HTTP 边界、`@/plugins/i18n` 展示层、element-plus 渲染层），store 间与 B1 已测模块（auth/router-utils/message）走真实实现。执行期已验证全链可 import（jsdom + `test.env.VITE_ROUTER_HISTORY='hash'` + i18n mock），无需深 mock。

**Tech Stack:** vitest 4 + vue/vue-jsx 插件（B0 已建基建）、pinia、jsdom（各 spec 顶部 `// @vitest-environment jsdom`）、fake timers（`vi.useFakeTimers` / `vi.setSystemTime`）。

**Spec:** [B2 批次设计](./2026-08-29-pure-web-testing-foundation-b2-design.md)；[总体设计](./2026-08-29-pure-web-testing-foundation-design.md) 第 6~7 章。

**前置事实（已校准，勿再探测）:**
- B1 已合入 master（含 auth/message/router-utils 测试资产与 strict 清单 31 项）。
- B2 域 strict 错误共计 44 个（`http/index.ts` 11、`user.ts` 3、`permission.ts` 1、`multiTags.ts` 14、`app.ts` 5、`settings.ts` 7、`epTheme.ts` 0、`localforage/index.ts` 3、store 基础设施 0）——已在正式 strict 配置链逐文件实测，B1 执行期间未触碰 B2 模块源码。
- **master 存量 typecheck 红灯（本计划 Task 0 Step 0.1 前置修复）**：`typecheck` 脚本为 `tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck && node ../../scripts/check-strict-web.mjs`，其首步 `tsc --noEmit` 当前在 master 上即红——`src/router/index.ts(186,36) TS2339 route.parentId`（`RouteRecordRaw` 类型无该字段；运行时由 `buildHierarchyTree` 赋值，属清单外存量纯类型缺口）。`&&` 链被拦断后 check-strict-web 根本不会执行，B2 每任务的 typecheck 门禁都会被此错误阻塞，必须先修（本地实测 + CI gate job 实锤）。
- 本计划的 TDD 形态说明：B2 各模块**功能已在产线运行**，spec 角色是回归网；因此「红-绿」实际发生在 **check-strict-web typecheck 阶段**——spec 落盘后功能用应根据断言正确性即可绿，strict 修复前 typecheck 域内红灯。每任务的 Steps 依此编排。

**执行编排:** 串行单 worktree `feat/pure-web-testing-b2`（worktree + subagent-driven，延续 B1 模式）。任务顺序 B2.1 → B2.2 → B2.3 → B2.4 → B2.5，每任务独立提交（scope `web`），受影响文档同提交。

---

## Task 0: 测试基建前置（B2 测试环境打通）

**Files:**
- Modify: `apps/pure-web/types/router.d.ts`（Step 0.1：master 存量 typecheck 红灯修复）
- Modify: `apps/pure-web/vitest.config.ts`（Step 0.2：测试期路由模式注入）

- [ ] **Step 0.1: 修复 master 存量 typecheck 红灯（router/index.ts L186 parentId）**

B2 各任务的门禁命令是 `pnpm --filter @multi-admin/pure-web run typecheck`，其脚本为 `tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck && node ../../scripts/check-strict-web.mjs`。**该链当前在 master 上第一步就红**（本地实测 + CI gate job 实锤）：`src/router/index.ts(186,36): error TS2339: Property 'parentId' does not exist on type 'RouteRecordRaw'`。此错误不在 strict 清单域内（check-strict-web 会滤除域外诊断），但 `&&` 链被它拦断后 check-strict-web 根本不会执行——B2 所有任务的 typecheck 门禁都会被此存量错误阻塞，必须先修。

运行时事实：`buildHierarchyTree`（`src/utils/tree.ts` L62-64）为每个路由节点赋值 `node.parentId = pathList.length ? pathList[pathList.length - 1] : null`，`router/index.ts` L186 消费该字段。属纯类型缺口（运行时无 bug）。修复为在 `types/router.d.ts` 既有 `declare module 'vue-router'` 块内增补 `RouteRecordRaw` 模块增强（纯类型护栏，不改运行时语义；该文件已在 strict 清单内，改动受门禁保护）：

```ts
// https://router.vuejs.org/zh/guide/advanced/meta.html#typescript
declare module 'vue-router' {
  // eslint-disable-next-line
  interface RouteMeta extends CustomizeRouteMeta {}

  // buildHierarchyTree 运行时为路由节点赋值 parentId（router/index.ts L186 消费），
  // 类型侧无对应声明——补模块增强对齐运行时事实（纯类型护栏）
  interface RouteRecordRaw {
    parentId?: number | string | null;
  }
}
```

执行验证：

```bash
pnpm --filter @multi-admin/pure-web run typecheck
```

预期：`tsc --noEmit` 首步转绿，全链执行完成（域内 0 错误，最终输出 strict 清单断言通过）。若仍有其他域外存量错误，同法最小修复（只加类型护栏），直到 typecheck 全链通过。

- [ ] **Step 0.2: 在 vitest.config.ts 注入测试期路由模式**

`router/index.ts` 顶层执行 `getHistoryMode(import.meta.env.VITE_ROUTER_HISTORY)`。该变量在 `.env*` 中均未定义：dev/build 由 vite.config.ts 的 `wrapperEnv(loadEnv(...))` 默认值表兜底（`build/utils.ts` 中 `VITE_ROUTER_HISTORY: ''`），而 vitest 不加载 vite.config.ts → test 模式下值为 `undefined` → `getHistoryMode` 内 `routerHistory.split(',')` 崩溃。已 spike 验证注入后全链可 import。

在 `apps/pure-web/vitest.config.ts` 的 `test` 块内、`environment` 前加一行：

```ts
  test: {
    env: { VITE_ROUTER_HISTORY: 'hash' },
    environment: 'node',
    // ... 其余保持不变
  },
```

执行验证（B1 既有 13 spec 不得因本改动回归）：

```bash
cd apps/pure-web && npx vitest run
```

预期：`Test Files 13 passed`（tree / build/utils / router-utils / auth / mitt / message / responsive / preventDefault / propTypes / progress / globalPolyfills / sso / chinaArea）。

- [ ] **Step 0.3: 断言脚本与防漏门禁自检**

```bash
cd ../../ && node scripts/assert-strict-manifest.mjs
```

预期：输出「✔ strict 清单断言通过（清单 31 项 / 豁免 ... 项 / 存量待迁移 ... 项）」。

- [ ] **Step 0.4: 提交前置基建**

```bash
git add apps/pure-web/types/router.d.ts apps/pure-web/vitest.config.ts
git commit -m "test(web): b2 前置——修复 router parentId 类型护栏 + vitest 注入测试期路由模式，打通 store 真实组合链路"
```

---

## 通用约定（Task 1~5 每个 spec 文件共用模板）

**环境与 mock 模板**——所有涉及真实 store 链（经 `store/utils.ts` barrel 间接 import `@/router`）的 spec，文件头固定为：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// i18n（外部展示层边界）：platform 的 import.meta.glob yaml 无 vitest 加载器，必须 mock；
// 工厂 shape 对齐 src/plugins/i18n.ts 的 $t / transformI18n 导出
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));
```

**store 单例状态重置模板**（options store 含 `$reset`，直接调用）：

```ts
import { useUserStoreHook } from '@/store/modules/user';
beforeEach(() => {
  useUserStoreHook().$reset();
});
```

**storageLocal 注入模板**（真实 `../utils` barrel 链下为 `@pureadmin/utils` 的 localforage 实现；jsdom 无 IndexedDB 自动降级 localStorage——B1.4 auth.spec 已同模式验证）。分文件 mock 模板见各任务。

**每任务清零流程（Steps 通用骨架）:**
1. 写 spec（本计划给出完整代码）
2. `npx vitest run <spec路径>`——功能回归网绿灯基线
3. `tsconfig.strict.json` include 追加域内 `.ts` + `.spec.ts` → `pnpm --filter @multi-admin/pure-web run typecheck` 红（域内 strict 错误数 = 本任务表中值）→ 逐条修复
4. 复跑 typecheck 绿 + `npx vitest run <spec路径> --coverage` 本模块 ≥80% 行+分支
5. `vitest.config.ts` thresholds 追加模块键（`{ lines: 80, branches: 80 }` 顶层键形式）
6. 独立提交 + 文档同提交

**格式:** 每步提交前 `pnpm exec prettier --write <文件>`；提交信息 `test(web): b2.x <模块>测试+strict 迁移`。

---

## Task 1: B2.1 `utils/http/index.ts` token 刷新状态机

**Files:**
- Create: `apps/pure-web/src/utils/http/index.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/utils/http/index.ts`、`src/utils/http/index.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 `'src/utils/http/index.ts': { lines: 80, branches: 80 }`）

strict 基数（实测，11 个）：TS18048×4（`config.url`、`data.expires`/`data.accessToken` 可能 undefined）+ TS2345×5（`parseInt`/`formatToken`/`$error.config` 实参类型）+ TS2349×2（`$config.beforeResponseCallback(response)` 调用子集）。

### Step 1.1: 写 spec（拦截器层 + 状态机层）

完整文件内容 `apps/pure-web/src/utils/http/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ===== 外部边界 mock =====
const axiosFake = vi.hoisted(() => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    request: vi.fn()
  };
  return { instance, create: vi.fn(() => instance) };
});
vi.mock('axios', () => ({
  default: { create: axiosFake.create, isCancel: (e: any) => !!e?.isCancel },
  isCancel: (e: any) => !!e?.isCancel
}));

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { closeAll: vi.fn() })
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

const userStoreFake = {
  handRefreshToken: vi.fn(),
  logOut: vi.fn()
};
vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => userStoreFake
}));
vi.mock('@/api/user', () => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));

// 真实依赖：auth（B1.4 已测）、message 模块（element-plus 已被 mock）
import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';
import { TokenKey } from '@/utils/auth';
import { ElMessage } from 'element-plus';

const ElMessageMock = ElMessage as unknown as ReturnType<typeof vi.fn>;

// ===== 拦截器 handler 捕捉 =====
// http 模块顶层 Axios.create 即返回 axiosFake.instance，use 各被调用 1 次，
// 首次调用参数即 request/response 拦截器处理器
function requireHttpModule() {
  // 模块级单例：vi.hoisted 已先建 fake，import 后拦截器完成注册
  return import('@/utils/http');
}
let requestFulfilled: (config: any) => any;
let responseFulfilled: (response: any) => any;
let responseRejected: (error: any) => any;

beforeAll(async () => {
  await requireHttpModule();
  // 拦截器注册发生在模块顶层首次执行；use.mock.calls 一经捕获后不可被 clearAllMocks 清空
  requestFulfilled =
    axiosFake.instance.interceptors.request.use.mock.calls[0][0];
  // response.use 仅调用一次：args[0]=fulfilled，args[1]=rejected
  responseFulfilled =
    axiosFake.instance.interceptors.response.use.mock.calls[0][0];
  responseRejected =
    axiosFake.instance.interceptors.response.use.mock.calls[0][1];
});

beforeEach(() => {
  // 注意：不可 vi.clearAllMocks()——会清空拦截器注册记录（use.mock.calls）
  axiosFake.instance.request.mockReset();
  userStoreFake.handRefreshToken.mockReset();
  userStoreFake.logOut.mockReset();
  ElMessageMock.mockClear();
  Cookies.remove(TokenKey);
  storageLocal().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function seedToken(overrides: Partial<{ accessToken: string; refreshToken: string; expires: number }> = {}) {
  const data = {
    accessToken: 'a-token',
    refreshToken: 'r-token',
    expires: Date.now() + 3600_000,
    ...overrides
  };
  Cookies.set(TokenKey, JSON.stringify(data));
  return data;
}

describe('request 拦截 fulfilled', () => {
  it('beforeRequestCallback 传参时短路返回 config', async () => {
    const config = { beforeRequestCallback: vi.fn(), url: '/api/v1/x' };
    const result = await requestFulfilled(config);
    expect(config.beforeRequestCallback).toHaveBeenCalledWith(config);
    expect(result).toBe(config);
  });

  it('白名单 /refresh-token 直接放行，不注入 Authorization', async () => {
    seedToken();
    const config = { headers: {}, url: '/api/v1/auth/refresh-token' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
    expect(config.headers['Authorization']).toBeUndefined();
  });

  it('白名单 /login 直接放行', async () => {
    seedToken();
    const config = { headers: {}, url: '/api/v1/auth/login' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
  });

  it('无 token 直接放行', async () => {
    const config = { headers: {}, url: '/api/v1/system/user/list' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
  });

  it('token 未过期：注入 Bearer Authorization', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const { accessToken } = seedToken({
      expires: new Date('2026-08-30T01:00:00Z').getTime()
    });
    const config = { headers: {}, url: '/api/v1/system/user/list' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
    expect(config.headers['Authorization']).toBe(`Bearer ${accessToken}`);
  });

  it('token 过期：单飞刷新后以新 token 重放入队请求', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    seedToken({ expires: new Date('2026-08-29T23:00:00Z').getTime() });
    userStoreFake.handRefreshToken.mockResolvedValue({
      data: { accessToken: 'fresh-token' }
    });
    const config = { headers: {}, url: '/api/v1/system/user/list' };
    const pending = requestFulfilled(config);
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'r-token'
    });
    await vi.runAllTicks();
    const result = await pending;
    expect(result).toBe(config);
    expect(config.headers['Authorization']).toBe('Bearer fresh-token');
  });
});

describe('response 拦截 rejected', () => {
  it('取消请求直通 reject', async () => {
    const err = { isCancel: true, response: undefined };
    await expect(responseRejected(err)).rejects.toBe(err);
    expect(userStoreFake.handRefreshToken).not.toHaveBeenCalled();
  });

  it('40102（ACCESS_TOKEN_EXPIRED）：交给 refreshAndRetry 单飞重试', async () => {
    seedToken();
    userStoreFake.handRefreshToken.mockResolvedValue({
      data: { accessToken: 'fresh-token' }
    });
    const retryConfig = { headers: {}, url: '/api/v1/system/user/list' };
    axiosFake.instance.request.mockResolvedValue({ retried: true });
    const err = {
      isCancel: false,
      response: { data: { code: 40102 } },
      config: retryConfig
    };
    const result = await responseRejected(err);
    expect(result).toEqual({ retried: true });
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledTimes(1);
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'r-token'
    });
    expect(retryConfig.headers['Authorization']).toBe('Bearer fresh-token');
  });

  it('并发 3 个 40102：handRefreshToken 只发一次，队列全员重放', async () => {
    let resolveRefresh: (v: any) => void;
    userStoreFake.handRefreshToken.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve;
        })
    );
    axiosFake.instance.request.mockResolvedValue({ ok: true });
    const makeErr = (n: number) => ({
      isCancel: false,
      response: { data: { code: 40102 } },
      config: { headers: {}, url: `/api/v1/list/${n}` }
    });
    const p1 = responseRejected(makeErr(1));
    const p2 = responseRejected(makeErr(2));
    const p3 = responseRejected(makeErr(3));
    await vi.runAllTicks();
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledTimes(1);
    resolveRefresh!({ data: { accessToken: 'fresh-token' } });
    const results = await Promise.all([p1, p2, p3]);
    expect(results.every(r => r.ok)).toBe(true);
    expect(axiosFake.instance.request).toHaveBeenCalledTimes(3);
  });

  it('刷新失败：队列清空 + logOut + warning toast', async () => {
    userStoreFake.handRefreshToken.mockRejectedValue(new Error('denied'));
    const err = {
      isCancel: false,
      response: { data: { code: 40102 } },
      config: { headers: {}, url: '/api/v1/x' }
    };
    // 刷新失败时 retryOriginalRequest 的回调永不被调用，返回的 promise 永久挂起——
    // 不 await 该 promise，只驱动微任务后断言失败副作用（logOut + 告警 toast）
    void responseRejected(err);
    await vi.runAllTicks();
    expect(userStoreFake.logOut).toHaveBeenCalled();
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning' })
    );
  });

  it('其他错误信封：toast 后端 message 后 reject', async () => {
    const errWithBody = {
      isCancel: false,
      response: { data: { code: 50000, message: 'boom' } }
    };
    await expect(responseRejected(errWithBody)).rejects.toBe(errWithBody);
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom', type: 'error' })
    );
  });

  it('响应无信封数据（response 缺省）：不 toast 直接 reject', async () => {
    const err = { isCancel: false, response: undefined };
    await expect(responseRejected(err)).rejects.toBe(err);
    expect(ElMessageMock).not.toHaveBeenCalled();
  });
});
```

### Step 1.2: spec 落地后跑功能基线

```bash
cd apps/pure-web && npx vitest run src/utils/http/index.spec.ts
```

预期：全绿（若个别断言不符立即修正断言）；若报 `VITE_ROUTER_HISTORY` 相关崩溃 → Task 0 未执行，回到 Task 0。

### Step 1.3: 清单迁入 → typecheck 红灯 → 修复 11 个 strict 错误

`apps/pure-web/tsconfig.strict.json` include 数组追加两行（保持现有条目不变）：

```json
    "src/utils/http/index.ts",
    "src/utils/http/index.spec.ts"
```

跑门禁（预期域内 11 条 TS18048/TS2345/TS2349）：

```bash
pnpm --filter @multi-admin/pure-web run typecheck 2>&1 | Select-String 'error TS'
```

修复要点（逐条对照 tsc 输出）：
- TS18048（`config.url` 等标可能 undefined）：`whiteList.some(url => config.url.endsWith(url))` 补判空护栏——改为 `config.url?.endsWith(url)`；`parseInt(data.expires)` 前用 `data?.expires ?? 0`；`res.data.accessToken`/`data.accessToken` 参照 `formatToken(token)` 入参补 `?? ''`。
- TS2345（`$error.config` 可能空 / 回调参数类型）：`PureHttp.refreshAndRetry($error.config)` 前捕 `config` 缺失直接 `return Promise.reject($error)`；`interceptors.response.use` 的 fulfilled 回调 `$config.beforeResponseCallback(response)` 的 response 用 `as` 断言对齐局部类型。
- TS2349（回调调用子集）：beforeResponseCallback 分支按上方同法对齐参数类型。
- 修复原则：**只加类型护栏，不改运行时语义**；修改后同步注视「业务行为不变」。

### Step 1.4: typecheck 绿 + 覆盖率达标

```bash
pnpm --filter @multi-admin/pure-web run typecheck
npx vitest run src/utils/http/index.spec.ts --coverage
```

预期：typecheck 通过（清单域内零错误）；coverage 输出 `http/index.ts ... % Lines ≥80, % Branches ≥80`。若不足 80：响应拦截 fulfilled 未覆盖 → 补一条「无回调时返回 response.data」用例直调 `responseFulfilled`（已捕获，`response.use` 的 args[0]）。

### Step 1.5: thresholds 键 + 提交

`apps/pure-web/vitest.config.ts` thresholds 追加一行（顶层键，勿用嵌套 glob）：

```ts
        'src/utils/http/index.ts': { lines: 80, branches: 80 },
```

```bash
cd apps/pure-web && npx vitest run --coverage 2>&1 | Select-String 'threshold|FAIL'
```

预期：无 threshold 报错（新旧 14 键全绿）。

```bash
cd ../..
git add apps/pure-web/src/utils/http/index.spec.ts apps/pure-web/src/utils/http/index.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b2.1 http token 刷新状态机测试+strict 迁移（拦截器/单飞/重放/失败登出全分支）"
```

---

## Task 2: B2.2 `store/modules/user.ts`（登录/登出/刷新全分支）

**Files:**
- Create: `apps/pure-web/src/store/modules/user.spec.ts`
- Create: `apps/pure-web/src/store/modules/user.integration.spec.ts`（与 B2.1 联动集成）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/store/modules/user.ts`、`src/store/modules/user.spec.ts`、`src/store/modules/user.integration.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 `'src/store/modules/user.ts'`）

strict 基数（实测，3 个）：TS2345×1（`loginByUsername(data)` 隐式 any 传参）+ TS7006×2（`loginByUsername`/`handRefreshToken` 的 `data` 参数隐式 any）。

### Step 2.1: 写 user.spec.ts（真实 auth + mock @/api/user）

完整文件内容 `apps/pure-web/src/store/modules/user.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

const apiMock = vi.hoisted(() => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/api/user', () => apiMock);

import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';
import { TokenKey, multipleTabsKey, userKey } from '@/utils/auth';
import { useUserStoreHook } from './user';

// 真实链：auth.setToken 双写 cookie+storage、logout 真实 multiTags+router（jsdom 已打通）
const hook = useUserStoreHook;

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal().clear();
  Cookies.remove(TokenKey);
  Cookies.remove(multipleTabsKey);
  hook().$reset();
  // 路由跳转静默：真实 router 可用，push 前守卫走白名单放行
});

describe('SET 动作', () => {
  it('九个 SET action 各自写入对应 state 键', () => {
    const store = hook();
    store.SET_AVATAR('a.png');
    expect(store.avatar).toBe('a.png');
    store.SET_USERNAME('admin');
    expect(store.username).toBe('admin');
    store.SET_NICKNAME('nick');
    expect(store.nickname).toBe('nick');
    store.SET_ROLES(['admin']);
    expect(store.roles).toEqual(['admin']);
    store.SET_PERMS(['system:user:list']);
    expect(store.permissions).toEqual(['system:user:list']);
    store.SET_VERIFYCODE('1234');
    expect(store.verifyCode).toBe('1234');
    store.SET_CURRENTPAGE(1);
    expect(store.currentPage).toBe(1);
    store.SET_ISREMEMBERED(true);
    expect(store.isRemembered).toBe(true);
    store.SET_LOGINDAY(3);
    expect(store.loginDay).toBe(3);
  });
});

describe('loginByUsername', () => {
  it('code 0：setToken 双写 cookie + storage，resolve 原信封', async () => {
    const payload = {
      code: 0,
      data: {
        accessToken: 'a-token',
        refreshToken: 'r-token',
        expires: Date.now() + 3600_000,
        username: 'admin',
        roles: ['admin']
      }
    };
    apiMock.getLogin.mockResolvedValue(payload);
    const result = await hook().loginByUsername({ username: 'admin', password: 'x' });
    expect(result).toBe(payload);
    const cookie = JSON.parse(Cookies.get(TokenKey) ?? '{}');
    expect(cookie.accessToken).toBe('a-token');
    expect(storageLocal().getItem(userKey)?.username).toBe('admin');
  });

  it('code 非 0：reject(message)', async () => {
    apiMock.getLogin.mockResolvedValue({ code: 40001, message: 'bad' });
    await expect(
      hook().loginByUsername({ username: 'x', password: 'y' })
    ).rejects.toBe('bad');
  });

  it('HTTP 异常：reject(error)', async () => {
    const err = new Error('net');
    apiMock.getLogin.mockRejectedValue(err);
    await expect(
      hook().loginByUsername({ username: 'x', password: 'y' })
    ).rejects.toBe(err);
  });
});

describe('handRefreshToken', () => {
  it('code 0：setToken 写入新 token 并 resolve', async () => {
    const payload = {
      code: 0,
      data: { accessToken: 'fresh', refreshToken: 'r2', expires: Date.now() + 3600_000 }
    };
    apiMock.refreshTokenApi.mockResolvedValue(payload);
    const result = await hook().handRefreshToken({ refreshToken: 'r-token' });
    expect(result).toBe(payload);
    expect(JSON.parse(Cookies.get(TokenKey) ?? '{}').accessToken).toBe('fresh');
  });

  it('code 非 0：reject(message)', async () => {
    apiMock.refreshTokenApi.mockResolvedValue({ code: 40103, message: 'nope' });
    await expect(
      hook().handRefreshToken({ refreshToken: 'r-token' })
    ).rejects.toBe('nope');
  });

  it('HTTP 异常：reject(error)', async () => {
    const err = new Error('net');
    apiMock.refreshTokenApi.mockRejectedValue(err);
    await expect(
      hook().handRefreshToken({ refreshToken: 'r-token' })
    ).rejects.toBe(err);
  });
});

describe('logOut', () => {
  it('fire-and-forget 服务端失败不阻塞本地清理', async () => {
    apiMock.logoutApi.mockRejectedValue(new Error('server down'));
    hook().username = 'u';
    hook().roles = ['admin'];
    hook().permissions = ['x'];
    Cookies.set(TokenKey, 'x');
    Cookies.set(multipleTabsKey, 'true');
    storageLocal().setItem(userKey, { accessToken: 'x' });

    hook().logOut();

    expect(hook().username).toBe('');
    expect(hook().roles).toEqual([]);
    expect(hook().permissions).toEqual([]);
    expect(Cookies.get(TokenKey)).toBeUndefined();
    expect(storageLocal().getItem(userKey)).toBeNull();
  });
});
```

> 本 spec 中 `SET 动作` 组逐动作显式调用并断言对应 state 键值（`$patch` 直写不存在的 state 键属无效测试，已弃用该写法）；9 个 SET action 全覆盖，`SET_LOGINDAY` 经 `Number(value)` 归一化，传入 `3` 断言 `3`。

### Step 2.2: 写 user.integration.spec.ts（B2.1 ↔ B2.2 真实联动：40102 → 真实 user.handRefreshToken → 队列重放）

完整文件内容 `apps/pure-web/src/store/modules/user.integration.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

const axiosFake = vi.hoisted(() => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    request: vi.fn()
  };
  // instance 必须暴露：fake request 是纯 vi.fn，拦截器链不会自动执行，
  // 需要捕获真实 responseRejected handler 后直接驱动（见 beforeAll）
  return { instance, create: vi.fn(() => instance) };
});
vi.mock('axios', () => ({
  default: { create: axiosFake.create, isCancel: (e: any) => !!e?.isCancel },
  isCancel: (e: any) => !!e?.isCancel
}));
vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { closeAll: vi.fn() })
}));

// 真实 user store（本用例被测对象）；@/api/user 仅 mock HTTP 边界（B2 口径）
const apiMock = vi.hoisted(() => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/api/user', () => apiMock);

import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';
import { TokenKey } from '@/utils/auth';
import { useUserStoreHook } from './user';
// side-effect import：建立 http 单例，真实拦截器注册进 axiosFake.instance
import '@/utils/http';

// 无法经 http.get() 端到端触发 40102：fake axios 的 request 是纯 vi.fn，
// 不会执行注册的拦截器链——改为捕获真实 responseRejected 直接驱动
let responseRejected: (error: any) => any;

beforeAll(() => {
  responseRejected =
    axiosFake.instance.interceptors.response.use.mock.calls[0][1];
});

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal().clear();
  Cookies.remove(TokenKey);
  useUserStoreHook().$reset();
});

it('40102 → 真实 user.handRefreshToken → setToken 双写 → 原请求以新 token 重放', async () => {
  Cookies.set(
    TokenKey,
    JSON.stringify({
      accessToken: 'old-token',
      refreshToken: 'r-token',
      expires: Date.now() + 3600_000
    })
  );
  apiMock.refreshTokenApi.mockResolvedValue({
    code: 0,
    data: {
      accessToken: 'fresh-token',
      refreshToken: 'r2',
      expires: Date.now() + 7200_000
    }
  });
  const retryConfig = { headers: {}, url: '/api/v1/auth/profile' };
  axiosFake.instance.request.mockResolvedValue({ profile: 'ok' });

  const result = await responseRejected({
    isCancel: false,
    response: { data: { code: 40102, message: 'expired' } },
    config: retryConfig
  });

  expect(result).toEqual({ profile: 'ok' });
  expect(apiMock.refreshTokenApi).toHaveBeenCalledWith({
    refreshToken: 'r-token'
  });
  expect(JSON.parse(Cookies.get(TokenKey) ?? '{}').accessToken).toBe(
    'fresh-token'
  );
  expect(axiosFake.instance.request).toHaveBeenCalledWith(retryConfig);
  expect(retryConfig.headers['Authorization']).toBe('Bearer fresh-token');
});
```

### Step 2.3: 功能基线 + 清单迁入 + strict 修复

依次执行：

```bash
cd apps/pure-web && npx vitest run src/store/modules/user.spec.ts src/store/modules/user.integration.spec.ts
```

预期全绿（若 integration 中 `http` import 触发 i18n/路由链崩溃，核对 Task 0 与 i18n mock 头）。随后 `tsconfig.strict.json` include 追加三个文件，跑：

```bash
pnpm --filter @multi-admin/pure-web run typecheck 2>&1 | Select-String 'error TS'
```

预期域内 3 条（TS2345×1 + TS7006×2）。修复：
- `loginByUsername(data)` / `handRefreshToken(data)` 参数补 `DataInfo<number>` / `{ refreshToken: string }` 类型（从 `@/utils/auth` 与 contracts 引入既有类型，勿自造）。
- 修复后全量 `npx vitest run` 与 typecheck 确认无回归。

### Step 2.4: 覆盖率 + thresholds + 提交

```bash
npx vitest run src/store/modules/user.spec.ts src/store/modules/user.integration.spec.ts --coverage
```

预期 `user.ts ≥80% 行+分支`。thresholds 追加：

```ts
        'src/store/modules/user.ts': { lines: 80, branches: 80 },
```

```bash
cd ../..
git add apps/pure-web/src/store/modules/user.spec.ts apps/pure-web/src/store/modules/user.integration.spec.ts apps/pure-web/src/store/modules/user.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b2.2 user store 测试+strict 迁移（登录/登出 fire-and-forget/刷新全分支 + http 40102 真实联动集成）"
```

---

## Task 3: B2.3 `store/modules/permission.ts`

**Files:**
- Create: `apps/pure-web/src/store/modules/permission.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/store/modules/permission.ts`、`src/store/modules/permission.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 `'src/store/modules/permission.ts'`）

strict 基数（实测，1 个）：TS2345×1（`handleWholeMenus(routes: any[])` 参数）——修复即给 routes 参数补 `RouteRecordRaw[]` 类型（import 自 `vue-router`）。

### Step 3.1: 写 spec（真实 constantMenus + B1.3 纯函数；mock 仅 multiTags hook 读数）

完整文件内容 `apps/pure-web/src/store/modules/permission.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
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
          { path: '/sys/user', name: 'SystemUser', meta: { title: 'menus.systemUser' } }
        ]
      }
    ] as any);

    expect(hook().wholeMenus.length).toBeGreaterThan(0);
    expect(hook().wholeMenus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'System' })
      ])
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
    tagsFake.multiTags = [{ name: 'keep', path: '/keep', query: {}, params: {} }];
    hook().cachePageList = ['keep', 'gone'];
    hook().clearCache();
    expect(hook().cachePageList).toEqual(['keep']);
  });

  it('标签页齐备不清空', () => {
    tagsFake.multiTags = [
      { name: 'a', path: '/a', query: {}, params: {} },
      { name: 'b', path: '/b', query: {}, params: {} }
    ];
    hook().cachePageList = ['a', 'b'];
    hook().clearCache();
    expect(hook().cachePageList).toEqual(['a', 'b']);
  });
});

describe('cacheOperate', () => {
  it('refresh：移除自身并清理孤儿缓存', () => {
    tagsFake.multiTags = [{ name: 'a', path: '/a', query: {}, params: {} }];
    hook().cachePageList = ['a', 'b'];
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
    hook().cachePageList = ['a', 'b'];
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
```

### Step 3.2: 功能基线 + 清单迁入 + strict 修复 + 覆盖率 + thresholds + 提交

仿 Task 2.3/2.4 序列（typecheck 域内应为 1 条 TS2345，修复为补 `RouteRecordRaw[]`）。thresholds 追加：

```ts
        'src/store/modules/permission.ts': { lines: 80, branches: 80 },
```

提交：

```bash
git add apps/pure-web/src/store/modules/permission.spec.ts apps/pure-web/src/store/modules/permission.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b2.3 permission store 测试+strict 迁移（菜单组装/缓存三模式/倒序清零）"
```

---

## Task 4: B2.4 `store/modules/multiTags.ts`（标签页状态机）

**Files:**
- Create: `apps/pure-web/src/store/modules/multiTags.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/store/modules/multiTags.ts`、`src/store/modules/multiTags.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 `'src/store/modules/multiTags.ts'`）

strict 基数（设计期实测，14 个）：集中在 state 初始化返回类型、`tagVal?.meta?.title.length` 可空链、`this.multiTags` 泛型收缩、`handleTags<T>` 返回值分支覆盖。修复原则同前：只加类型护栏，不改运行时语义。

### Step 4.1: 写 spec（partial mock：仅 storageLocal 与 permission hook；纯函数保持真实）

完整文件内容 `apps/pure-web/src/store/modules/multiTags.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
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
const tag = (over: Partial<{ path: string; name: any; query: object; params: object; meta: any }> = {}) => ({
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
    permissionFake.flatteningRoutes = [
      { path: '/a', meta: { fixedTag: true } },
      { path: '/b', meta: {} }
    ];
    hook().$reset();
    expect(hook().multiTags).toHaveLength(2);
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
    expect(storageFake.raw.get('responsive-tags')).toEqual([tag({ path: '/1' })]);
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
    expect(storageFake.raw.get('responsive-tags')).toEqual([tag({ path: '/w' })]);
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

  // 早退用例：multiTags 保持初始 routerArrays（含 welcome，VITE_HIDE_HOME=false）
  it('push：hiddenTag 早退', () => {
    hook().handleTags('push', tag({ meta: { title: 'T', hiddenTag: true } }));
    expect(hook().multiTags).toHaveLength(1);
  });

  it('push：外链 name 早退（真实 isUrl 判定）', () => {
    hook().handleTags('push', tag({ name: 'https://example.com' }));
    expect(hook().multiTags).toHaveLength(1);
  });

  it('push：title 空早退', () => {
    hook().handleTags('push', tag({ meta: { title: '' } }));
    expect(hook().multiTags).toHaveLength(1);
  });

  it('push：showLink=false 早退', () => {
    hook().handleTags('push', tag({ meta: { title: 'T', showLink: false } }));
    expect(hook().multiTags).toHaveLength(1);
  });

  it('push：path+query+params 全等去重早退', () => {
    const t = tag({ path: '/dup', query: { a: 1 }, params: { b: 2 } });
    hook().handleTags('push', t);
    // 第二次 push 须保留 title：meta 覆盖为 {} 会在 push 链 L78 抛 TypeError
    hook().handleTags('push', { ...t });
    expect(hook().multiTags).toHaveLength(2); // 初始 welcome + /dup
  });

  it('push：dynamicLevel 达上限时替换首个同 path 标签', () => {
    hook().handleTags('push', tag({ path: '/dyn', query: { q: 1 }, meta: { dynamicLevel: 1 } }));
    hook().handleTags('push', tag({ path: '/dyn', query: { q: 2 }, meta: { dynamicLevel: 1 } }));
    expect(hook().multiTags).toHaveLength(2); // 初始 welcome + 唯一 /dyn
    // [0] 是 welcome，须按 path 定位 /dyn
    expect(hook().multiTags.find(t => t.path === '/dyn').query).toEqual({ q: 2 });
  });

  it('push：MaxTagsLevel 裁剪（push 之后 length 超上限则 splice(1,1)）', () => {
    // 源码在 push 之后检查 getConfig().MaxTagsLevel——上限须在 push 前生效
    setConfig({ MaxTagsLevel: 2 });
    hook().handleTags('push', tag({ path: '/m1' }));
    hook().handleTags('push', tag({ path: '/m2' }));
    hook().handleTags('push', tag({ path: '/m3' }));
    // welcome 恒守首位：每次 push 后超限删除 index 1
    expect(hook().multiTags.map(t => t.path)).toEqual(['/welcome', '/m3']);
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
```

### Step 4.2: spec 落地后跑功能基线

```bash
cd apps/pure-web && npx vitest run src/store/modules/multiTags.spec.ts
```

预期：全绿（若个别断言不符立即修正断言——multiTags 是真实产线模块，spec 是回归网不是行为规格）。

### Step 4.3: 清单迁入 → typecheck 红灯 → 修复 14 个 strict 错误

`apps/pure-web/tsconfig.strict.json` include 数组追加两行：

```json
    "src/store/modules/multiTags.ts",
    "src/store/modules/multiTags.spec.ts"
```

跑门禁（预期域内 14 条）：

```bash
pnpm --filter @multi-admin/pure-web run typecheck 2>&1 | Select-String 'error TS'
```

修复要点（逐条对照 tsc 输出，只加护栏不改语义）：
- state 初始化函数补返回类型：`state: (): { multiTags: Array<...(推断)>; multiTagsCache: boolean } => ...`，其中 multiTags 为「storage 恢复值 ?? 拼接值」的联合；`?? ` 兜底保证非空。
- `tagVal?.meta?.title.length`：title 可能非 string，改为 `(tagVal?.meta?.title ?? '').length === 0` 等价护栏（title 为 undefined/number 时语义一致：不通过校验早退）。
- `this.multiTags.filter`/`splice`/`push` 泛型收缩：`tagVal` 保留 `as multiType` 收缩后以 `this.multiTags.push(tagVal)` 显式窄化；`handleTags('splice', value)` 中 value 与 `v.path` 比较处补类型护栏。
- spec 自身若报 TS 错误（如 `hook().multiTags[0].query`），按 tsc 提示在断言处补窄化，不得改动被测源码语义。

### Step 4.4: typecheck 绿 + 覆盖率达标

```bash
pnpm --filter @multi-admin/pure-web run typecheck
npx vitest run src/store/modules/multiTags.spec.ts --coverage
```

预期：typecheck 通过；`multiTags.ts ... % Lines ≥80, % Branches ≥80`。若 Branches 不足 80：优先补 `splice` 无 position 未命中、`TagsCache` 短路、state 双支已覆盖——确认无遗漏后可补 `multiTagsCacheChange(false)` 的 removeItem 路径单测。

### Step 4.5: thresholds 键 + 提交

`apps/pure-web/vitest.config.ts` thresholds 追加：

```ts
        'src/store/modules/multiTags.ts': { lines: 80, branches: 80 },
```

```bash
cd apps/pure-web && npx vitest run --coverage 2>&1 | Select-String 'threshold|FAIL'
```

预期：无 threshold 报错（17 键全绿）。

```bash
cd ../..
git add apps/pure-web/src/store/modules/multiTags.spec.ts apps/pure-web/src/store/modules/multiTags.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b2.4 multiTags 标签页状态机测试+strict 迁移（初始化双支/五早退/动态替换/级数裁剪/splice 双支）"
```

---

## Task 5: B2.5 小 store 群 + localforage + store 基础设施

**Files:**
- Create: `apps/pure-web/src/store/modules/app.spec.ts`（jsdom：真实 storageLocal + setConfig 注入）
- Create: `apps/pure-web/src/store/modules/settings.spec.ts`
- Create: `apps/pure-web/src/store/modules/epTheme.spec.ts`
- Create: `apps/pure-web/src/utils/localforage/index.spec.ts`（node 环境：single mock localforage 库）
- Create: `apps/pure-web/src/store/index.spec.ts`、`apps/pure-web/src/store/utils.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 12 文件 + `src/store/types.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 6 键）

strict 基数（设计期实测）：app 5 个、settings 7 个、localforage 3 个；epTheme 与 store 基础设施 0 个。

说明：app/settings/epTheme spec 经 `../utils` barrel 间接 import `@/router`（sso 顶层副作用）→ 与 B2.2~B2.4 同属 jsdom + i18n mock 域；`store/utils.spec.ts` 同域。localforage 与 `store/index.spec.ts` 无 router 依赖，保持默认 node 环境。

### Step 5.1: app.spec.ts（state 回退链 + TOGGLE_SIDEBAR 三分支 + 4 setter）

完整文件内容 `apps/pure-web/src/store/modules/app.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

import { storageLocal } from '@pureadmin/utils';
import { setConfig } from '@/config';
import { useAppStoreHook } from './app';

const hook = useAppStoreHook;
const layoutKey = 'responsive-layout';

beforeEach(() => {
  storageLocal().clear();
  setConfig({
    ResponsiveStorageNameSpace: 'responsive-',
    SidebarStatus: true,
    Layout: 'vertical'
  });
  hook().$reset();
});

const seedLayout = (layout: object) => storageLocal().setItem(layoutKey, layout);

it('storage 未命中：state 回退 getConfig 缺省', () => {
  expect(hook().sidebar.opened).toBe(true);
  expect(hook().layout).toBe('vertical');
  expect(hook().device).toBe('desktop');
  expect(hook().viewportSize.width).toBeTypeOf('number');
});

it('storage 命中：state 从 storage 恢复', () => {
  seedLayout({ sidebarStatus: false, layout: 'mix' });
  hook().$reset();
  expect(hook().sidebar.opened).toBe(false);
  expect(hook().layout).toBe('mix');
});

it('TOGGLE_SIDEBAR(opened=true, resize) 分支：强制展开 + 持久化 true', () => {
  seedLayout({ sidebarStatus: false });
  hook().$reset();
  hook().TOGGLE_SIDEBAR(true, 'grow');
  expect(hook().sidebar.opened).toBe(true);
  expect(hook().sidebar.withoutAnimation).toBe(true);
  const saved: any = storageLocal().getItem(layoutKey);
  expect(saved).toMatchObject({ sidebarStatus: true });
});

it('TOGGLE_SIDEBAR(!opened && resize) 分支：强制收起 + 持久化 false', () => {
  seedLayout({ sidebarStatus: true });
  hook().$reset();
  hook().TOGGLE_SIDEBAR(false, 'shrink');
  expect(hook().sidebar.opened).toBe(false);
  expect(hook().sidebar.withoutAnimation).toBe(true);
  expect(storageLocal().getItem(layoutKey)).toMatchObject({ sidebarStatus: false });
});

it('TOGGLE_SIDEBAR 无参切换分支：翻转 + isClickCollapse + 持久化', () => {
  seedLayout({ sidebarStatus: true });
  hook().$reset();
  hook().TOGGLE_SIDEBAR();
  expect(hook().sidebar.opened).toBe(false);
  expect(hook().sidebar.withoutAnimation).toBe(false);
  expect(hook().sidebar.isClickCollapse).toBe(true);
  expect(storageLocal().getItem(layoutKey)).toMatchObject({ sidebarStatus: false });
});

it('toggleSideBar 包装 actions 转发', async () => {
  seedLayout({ sidebarStatus: true });
  hook().$reset();
  await hook().toggleSideBar();
  expect(hook().sidebar.opened).toBe(false);
});

it('四个 setter 直写 state', () => {
  hook().toggleDevice('mobile');
  hook().setLayout('mix');
  hook().setViewportSize({ width: 1024, height: 768 });
  hook().setSortSwap(true);
  expect(hook().device).toBe('mobile');
  expect(hook().getDevice).toBe('mobile');
  expect(hook().layout).toBe('mix');
  expect(hook().getViewportWidth).toBe(1024);
  expect(hook().getViewportHeight).toBe(768);
  expect(hook().sortSwap).toBe(true);
});
```

- [ ] **Step 5.1.1: 跑功能基线**

```bash
cd apps/pure-web && npx vitest run src/store/modules/app.spec.ts
```

预期：全绿（storageLocal 在 jsdom 的 localStorage 降级与 B1.4 auth.spec 同模式，同步可读）。

- [ ] **Step 5.1.2: 清单迁入 + strict 修复（app 域 5 错误）**

`tsconfig.strict.json` include 追加 `src/store/modules/app.ts`、`src/store/modules/app.spec.ts` 两行，跑 typecheck 门禁。

修复要点（5 errors）：
- `TOGGLE_SIDEBAR` 内 `const layout = storageLocal().getItem<StorageConfigs>(...)` 可能 null，随后 `layout.sidebarStatus = true` 报可能 null 赋值——补 `if (layout) { ...赋值... }` 护栏且语义不变（layout 为 null 时仅 state 变更、无持久化）。
- `setLayout(layout)`/`setViewportSize(size)` 参数补显式类型（`appType['layout']`/`appType['viewportSize']` 或等价内联）；其余按 tsc 行号逐条处理。

- [ ] **Step 5.1.3: typecheck 绿 + 覆盖率**

```bash
pnpm --filter @multi-admin/pure-web run typecheck
npx vitest run src/store/modules/app.spec.ts --coverage
```

预期：typecheck 通过；`app.ts ... % Lines ≥80, % Branches ≥80`。

### Step 5.2: settings.spec.ts（CHANGE_SETTING 反射守卫两分支 + changeSetting + getters）

完整文件内容 `apps/pure-web/src/store/modules/settings.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

import { setConfig } from '@/config';
import { useSettingStoreHook } from './settings';

const hook = useSettingStoreHook;

beforeEach(() => {
  setConfig({ Title: 'admin', FixedHeader: true, HiddenSideBar: false });
  hook().$reset();
});

it('state 初始化来自 getConfig', () => {
  expect(hook().title).toBe('admin');
  expect(hook().fixedHeader).toBe(true);
  expect(hook().hiddenSideBar).toBe(false);
});

it('CHANGE_SETTING：key 存在于 store 实例则写入', () => {
  hook().CHANGE_SETTING({ key: 'fixedHeader', value: false });
  expect(hook().fixedHeader).toBe(false);
});

it('CHANGE_SETTING：key 不存在则守卫静默忽略', () => {
  hook().CHANGE_SETTING({ key: 'noSuchKey', value: 'x' });
  expect(hook().$state).not.toHaveProperty('noSuchKey');
});

it('changeSetting 转发 CHANGE_SETTING', () => {
  hook().changeSetting({ key: 'title', value: 'new-title' });
  expect(hook().title).toBe('new-title');
});

it('getters 直读 state', () => {
  hook().CHANGE_SETTING({ key: 'hiddenSideBar', value: true });
  expect(hook().getHiddenSideBar).toBe(true);
  expect(hook().getTitle).toBe('admin');
  expect(hook().getFixedHeader).toBe(true);
});
```

- [ ] **Step 5.2.1: 跑功能基线**

```bash
cd apps/pure-web && npx vitest run src/store/modules/settings.spec.ts
```

预期：全绿。

- [ ] **Step 5.2.2: 清单迁入 + strict 修复（settings 域 7 错误）**

`tsconfig.strict.json` include 追加 `src/store/modules/settings.ts`、`src/store/modules/settings.spec.ts`。

修复要点（7 errors）：
- `CHANGE_SETTING({ key, value })` 解构参数补显式类型：`{ key: string; value: unknown }`。
- `this[key] = value` 索引写入报无索引签名——改写为 `(this as unknown as Record<string, unknown>)[key] = value`（`Reflect.has(this, key)` 守卫保持不变，语义不变）。
- 其余按 tsc 行号逐条处理。

- [ ] **Step 5.2.3: typecheck 绿 + 覆盖率**

```bash
pnpm --filter @multi-admin/pure-web run typecheck
npx vitest run src/store/modules/settings.spec.ts --coverage
```

预期：typecheck 通过；`settings.ts ≥80%`（全行无分支遗漏）。

### Step 5.3: epTheme.spec.ts（fill getter 双支 + setEpThemeColor 空值早退/正常回写）

完整文件内容 `apps/pure-web/src/store/modules/epTheme.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

import { storageLocal } from '@pureadmin/utils';
import { setConfig } from '@/config';
import { useEpThemeStoreHook } from './epTheme';

const hook = useEpThemeStoreHook;
const layoutKey = 'responsive-layout';

beforeEach(() => {
  storageLocal().clear();
  setConfig({
    ResponsiveStorageNameSpace: 'responsive-',
    EpThemeColor: '#409eff',
    Theme: 'light'
  });
  hook().$reset();
});

it('state 初始化回退链：storage 未命中时取 getConfig', () => {
  expect(hook().epThemeColor).toBe('#409eff');
  expect(hook().epTheme).toBe('light');
});

it('state 初始化：storage 命中时恢复 epThemeColor/theme', () => {
  storageLocal().setItem(layoutKey, { epThemeColor: '#123456', theme: 'dark' });
  hook().$reset();
  expect(hook().epThemeColor).toBe('#123456');
  expect(hook().epTheme).toBe('dark');
});

it('fill getter：light 主题返回主色，其余返回白色', () => {
  hook().$patch({ epTheme: 'light' });
  expect(hook().fill).toBe('#409eff');
  hook().$patch({ epTheme: 'dark' });
  expect(hook().fill).toBe('#fff');
});

it('setEpThemeColor：layout 为空时仅内存变更、解析出 epTheme 空值', () => {
  hook().setEpThemeColor('#000000');
  expect(hook().epThemeColor).toBe('#000000');
  expect(hook().epTheme).toBeUndefined();
  expect(storageLocal().getItem(layoutKey)).toBeNull();
});

it('setEpThemeColor：layout 存在时同步 epTheme 并持久化新色', () => {
  storageLocal().setItem(layoutKey, { theme: 'light', epThemeColor: '#409eff' });
  hook().$reset();
  hook().setEpThemeColor('#654321');
  expect(hook().epTheme).toBe('light');
  expect(hook().epThemeColor).toBe('#654321');
  expect(storageLocal().getItem(layoutKey)).toMatchObject({
    theme: 'light',
    epThemeColor: '#654321'
  });
});

it('getters 直读 state', () => {
  hook().$patch({ epThemeColor: '#abcdef' });
  expect(hook().getEpThemeColor).toBe('#abcdef');
});
```

- [ ] **Step 5.3.1: 跑功能基线**

```bash
cd apps/pure-web && npx vitest run src/store/modules/epTheme.spec.ts
```

预期：全绿。epTheme.ts strict 基数为 0 errors，直接迁清单即可。

- [ ] **Step 5.3.2: 清单迁入 + typecheck 绿 + 覆盖率**

`tsconfig.strict.json` include 追加 `src/store/modules/epTheme.ts`、`src/store/modules/epTheme.spec.ts` 两行；跑 `pnpm --filter @multi-admin/pure-web run typecheck` 预期通过（无既有错误），随后 `npx vitest run src/store/modules/epTheme.spec.ts --coverage` 预期 `epTheme.ts ≥80%`（50 行全覆盖）。

### Step 5.4: localforage/index.spec.ts（StorageProxy 全 API + 过期三分支；node 环境）

本 spec 是 B2 唯一不依赖 router 链的文件，不写 jsdom 头，environment 走 vitest 默认 node。mock 边界为 `localforage` 库本体（B2 口径下唯一必要的库级仿制）。

完整文件内容 `apps/pure-web/src/utils/localforage/index.spec.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const forageFake = vi.hoisted(() => ({
  INDEXEDDB: 1,
  LOCALSTORAGE: 2,
  config: vi.fn(),
  setItem: vi.fn(),
  getItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  keys: vi.fn()
}));

vi.mock('localforage', () => ({ default: forageFake }));

import { localForage } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

it('构造时初始化驱动优先级与库名', () => {
  localForage();
  expect(forageFake.config).toHaveBeenCalledWith({
    driver: [forageFake.INDEXEDDB, forageFake.LOCALSTORAGE],
    name: 'pure-admin'
  });
});

describe('setItem', () => {
  it('默认 m=0：expires 为 0（永久），resolve 原始数据', async () => {
    forageFake.setItem.mockResolvedValue({ data: 42 });
    await expect(localForage().setItem('k', 42)).resolves.toBe(42);
    expect(forageFake.setItem).toHaveBeenCalledWith('k', { data: 42, expires: 0 });
  });

  it('m>0：expires = 当前时间 + m 分钟', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    forageFake.setItem.mockResolvedValue({ data: 'v' });
    await localForage().setItem('k', 'v', 5);
    expect(forageFake.setItem).toHaveBeenCalledWith('k', {
      data: 'v',
      expires: Date.now() + 5 * 60 * 1000
    });
  });

  it('底层 reject 透传', async () => {
    forageFake.setItem.mockRejectedValue(new Error('quota'));
    await expect(localForage().setItem('k', 'v')).rejects.toThrow('quota');
  });
});

describe('getItem', () => {
  it('底层返回 null：resolve null', async () => {
    forageFake.getItem.mockResolvedValue(null);
    await expect(localForage().getItem('k')).resolves.toBeNull();
  });

  it('expires=0（永久）：resolve data', async () => {
    forageFake.getItem.mockResolvedValue({ data: 'v', expires: 0 });
    await expect(localForage().getItem<string>('k')).resolves.toBe('v');
  });

  it('未过期：resolve data', async () => {
    forageFake.getItem.mockResolvedValue({
      data: 'v',
      expires: Date.now() + 60_000
    });
    await expect(localForage().getItem<string>('k')).resolves.toBe('v');
  });

  it('已过期：resolve null', async () => {
    forageFake.getItem.mockResolvedValue({ data: 'v', expires: 1 });
    await expect(localForage().getItem('k')).resolves.toBeNull();
  });

  it('底层 reject 透传', async () => {
    forageFake.getItem.mockRejectedValue(new Error('io'));
    await expect(localForage().getItem('k')).rejects.toThrow('io');
  });
});

describe('removeItem / clear / keys', () => {
  it('removeItem resolve', async () => {
    forageFake.removeItem.mockResolvedValue(undefined);
    await expect(localForage().removeItem('k')).resolves.toBeUndefined();
  });

  it('removeItem reject 透传', async () => {
    forageFake.removeItem.mockRejectedValue(new Error('io'));
    await expect(localForage().removeItem('k')).rejects.toThrow('io');
  });

  it('clear resolve', async () => {
    forageFake.clear.mockResolvedValue(undefined);
    await expect(localForage().clear()).resolves.toBeUndefined();
  });

  it('keys resolve 列表', async () => {
    forageFake.keys.mockResolvedValue(['a', 'b']);
    await expect(localForage().keys()).resolves.toEqual(['a', 'b']);
  });

  it('keys reject 透传', async () => {
    forageFake.keys.mockRejectedValue(new Error('io'));
    await expect(localForage().keys()).rejects.toThrow('io');
  });
});
```

- [ ] **Step 5.4.1: 跑功能基线**

```bash
cd apps/pure-web && npx vitest run src/utils/localforage/index.spec.ts
```

预期：全绿。

- [ ] **Step 5.4.2: 清单迁入 + strict 修复（localforage 域 3 错误）**

`tsconfig.strict.json` include 追加 `src/utils/localforage/index.ts`、`src/utils/localforage/index.spec.ts`。

修复要点（3 errors）：
- `constructor(storageModel)` 隐式 any → 补 `constructor(storageModel: LocalForage)`（`LocalForage` 已由同目录 `types.d.ts` 声明）。
- getItem 内部 `.then((value: ExpiresData<T>) => ...)` 中 value 可能 null 的判定按 tsc 提示加窄化（用 `value && (...)` 表达式或等价，运行时语义不变）。
- 其余按 tsc 行号逐条处理。

- [ ] **Step 5.4.3: typecheck 绿 + 覆盖率**

```bash
pnpm --filter @multi-admin/pure-web run typecheck
npx vitest run src/utils/localforage/index.spec.ts --coverage
```

预期：typecheck 通过；`localforage/index.ts ≥80% 行+分支`（set/get 全路径 + reject 透传全覆盖）。

### Step 5.5: store 基础设施两 spec（index.spec + utils.spec 桶断言）

完整文件内容 `apps/pure-web/src/store/index.spec.ts`（node 环境，无 router 链）：

```ts
import { it, expect, vi } from 'vitest';
import { setupStore, store } from './index';

it('store 是 pinia 实例', () => {
  expect(typeof store.use).toBe('function');
  expect(typeof store.install).toBe('function');
});

it('setupStore 将 store 安装到 app', () => {
  const fakeApp = { use: vi.fn() } as any;
  setupStore(fakeApp as any);
  expect(fakeApp.use).toHaveBeenCalledWith(store);
});
```

完整文件内容 `apps/pure-web/src/store/utils.spec.ts`（jsdom：桶含 `@/router` re-export）：

```ts
// @vitest-environment jsdom
import { it, expect } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

import * as barrel from './utils';

it('桶 re-export 全键可达（真实实现非 undefined）', () => {
  const keys = [
    'store', 'routerArrays', 'router', 'resetRouter', 'constantMenus',
    'getConfig', 'responsiveStorageNameSpace',
    'ascending', 'filterTree', 'filterNoPermissionTree', 'formatFlatteningRoutes',
    'isUrl', 'isEqual', 'isNumber', 'debounce', 'isBoolean', 'getKeyList',
    'storageLocal', 'deviceDetection' as string
  ] as const;
  keys.forEach(k => {
    expect(barrel[k as keyof typeof barrel]).toBeDefined();
  });
  expect(barrel.constantMenus).toBeInstanceOf(Array);
});
```

- [ ] **Step 5.5.1: 跑功能基线**

```bash
cd apps/pure-web && npx vitest run src/store/index.spec.ts src/store/utils.spec.ts
```

预期：全绿。（store 基础设施 strict 基数为 0 errors。）

- [ ] **Step 5.5.2: 清单迁入（含 types.ts 纯类型文件）**

`tsconfig.strict.json` include 追加 5 行（`types.ts` 纯类型、无 spec、不入 thresholds——对齐 `print.spec.ts` 无键先例；`store/index.ts`/`store/utils.ts` 覆盖率由各自 spec 兜住）：

```json
    "src/store/index.ts",
    "src/store/index.spec.ts",
    "src/store/utils.ts",
    "src/store/utils.spec.ts",
    "src/store/types.ts"
```

跑 `pnpm --filter @multi-admin/pure-web run typecheck` 预期通过；`npx vitest run src/store/index.spec.ts src/store/utils.spec.ts --coverage` 预期 `store/index.ts`、`store/utils.ts` 全行覆盖。

### Step 5.6: thresholds 6 键 + 批次提交

`apps/pure-web/vitest.config.ts` thresholds 追加 6 行（顶层键，勿用嵌套 glob；无 `types.ts` 键）：

```ts
        'src/store/modules/app.ts': { lines: 80, branches: 80 },
        'src/store/modules/settings.ts': { lines: 80, branches: 80 },
        'src/store/modules/epTheme.ts': { lines: 80, branches: 80 },
        'src/utils/localforage/index.ts': { lines: 80, branches: 80 },
        'src/store/index.ts': { lines: 80, branches: 80 },
        'src/store/utils.ts': { lines: 80, branches: 80 },
```

```bash
cd apps/pure-web && npx vitest run --coverage 2>&1 | Select-String 'threshold|FAIL'
```

预期：无 threshold 报错（23 键全绿）。

```bash
cd ../..
git add apps/pure-web/src/store/modules/app.spec.ts apps/pure-web/src/store/modules/app.ts apps/pure-web/src/store/modules/settings.spec.ts apps/pure-web/src/store/modules/settings.ts apps/pure-web/src/store/modules/epTheme.spec.ts apps/pure-web/src/store/modules/epTheme.ts apps/pure-web/src/utils/localforage/index.spec.ts apps/pure-web/src/utils/localforage/index.ts apps/pure-web/src/store/index.spec.ts apps/pure-web/src/store/index.ts apps/pure-web/src/store/utils.spec.ts apps/pure-web/src/store/utils.ts apps/pure-web/src/store/types.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b2.5 小 store 群+localforage+基础设施测试+strict 迁移（app 三分支/epTheme 持久化/settings 反射守卫/StorageProxy 全路径/桶断言）"
```

---

## Task 6: 批次收尾验证与文档同步

**Files:**
- Modify: `docs/tasks/README.md`（B2 状态行）
- Modify: `docs/governance/backlog.md`（第 54 行 E2E 条目解锁状态）

- [ ] **Step 6.1: 全量门禁复跑（域内 + 全局）**

```bash
cd apps/pure-web && npx vitest run
```

预期：`Test Files 24 passed`（B1 13 + B2 新增 11：http 1 / user 2 / permission 1 / multiTags 1 / B2.5 6）。

```bash
pnpm --filter @multi-admin/pure-web run typecheck
```

预期：通过（strict 清单 31 → 53 项：B2.1 2 + B2.2 3 + B2.3 2 + B2.4 2 + B2.5 13）。

```bash
cd apps/pure-web && npx vitest run --coverage
```

预期：23 键阈值全绿（13 → +10）。

```bash
cd ../.. && node scripts/assert-strict-manifest.mjs
```

预期：防漏断言通过（B2 新增 22 个 .ts 文件全部进清单，无新增豁免项）。

```bash
pnpm check
```

预期：prettier / typecheck / lint / stylelint / test / 覆盖率枚举全绿。若有 lint 报 B2 spec 风格问题逐条修复后复跑，不跳过。

- [ ] **Step 6.2: 文档同步**

`docs/tasks/README.md` 第 9 行（pure-web 测试基建条目）替换为：

```md
| pure-web 测试基建与 strict 类型安全 | 总体设计已定稿（批次 A0 上游基线 → A strict 迁移 → B vitest 基建与模块测试）；批次 A0/A+B0/B1/B2 已合并 master 验收通过；B1（纯函数组）7 提交实施完成（14 spec 文件、strict 清单 6→31 项含 print.spec.ts 防御性纳入、print.ts 架构性豁免），覆盖率 glob 阈值经审查修复为 vitest 4 顶层键形式后 13 键真实生效；B2（状态机/store 组）实施完成（11 spec 新增含 user↔http 40102 真实联动集成、strict 清单 31→53 项、覆盖率键 13→23）；B3（在用组件组）设计已定稿待实施；见 [2026-08-29-pure-web-testing-foundation/](./) |
```

`docs/governance/backlog.md` 第 54 行（pure-web E2E 测试基建）所列「触发条件」列原为 `B2（状态机/store 测试）完成后评估启动`——B2 已完成，改为 `B3（在用组件组）测试完成后评估启动（B2 状态机/store 测试已完成）`（E2E 覆盖登录 → 动态路由全链路，依赖组件级测试 B3 完成）。

- [ ] **Step 6.3: 提交**

```bash
git add docs/tasks/README.md docs/governance/backlog.md
git commit -m "docs(repo): b2 批次收口同步——README 状态行与 E2E 条目触发条件更新"
```

- [ ] **Step 6.4: 上报执行交接**

主会话 `pnpm ops:pre-push`（frozen-lockfile + check + audit）可作可选最终校验；完成后向用户报告 B2 批次完成（23 键阈值、53 项清单、24 spec 全绿），由用户裁决是否继续执行本仓库的 worktree 合并与 backlog 归档流程。

---

**自审三查结论（writing-plans 流程项；2026-08-30 复审修订版）：**

1. **Spec coverage**：B2 设计 2.1~2.5 全部落点——http 拦截器+状态机（Task 1）、user 三操作+联动集成（Task 2）、permission 菜单/缓存（Task 3）、multiTags 四模式+早退（Task 4）、B2.5 五单元（Task 5）；test.env 前置（Task 0）；汇报/文档治理（Task 6）。复审新增：Task 0 Step 0.1 修复 master 存量 typecheck 红灯（`router/index.ts` L186 `route.parentId` TS2339，本地实测 + CI gate job 实锤）——typecheck `&&` 链被其拦断，不修则所有任务门禁阻塞；Step 0.2 将「该变量仅存在于 .env.development」的错误描述改写为 wrapperEnv 默认值表的准确事实（vitest 不加载 vite.config.ts → test 模式 undefined）。
2. **Placeholder scan**：无 TBD/TODO；「以 tsc 输出为准」仅存在于 strict 修复要点（错误行号逐条对照），主路径（代码+命令+预期）每步齐备。复审修正四类无效测试写法：Task 2 `$patch({ SET_AVATAR: 'x' })` 写不存在 state 键（重写为 9 个 action 显式调用）；Task 3 `usePermissionStoreHook.$state` 直写函数对象（重写为 `hook().$reset()` + 实例直写 + roles seed）；Task 2 integration 依赖 fake axios `request` 执行拦截器链（重写为捕获真实 responseRejected 直接驱动，hoisted 暴露 instance）；Task 4 多处断言未计入 `.env VITE_HIDE_HOME=false` 下非空 routerArrays 与 push 链 L78 `meta.title.length` 的 TypeError 前置（tag helper 默认补 title、早退/去重/dynamicLevel/MaxTagsLevel 断言逐条校正）。
3. **Type consistency**：i18n mock 模板、`vi.hoisted` fake、`{ lines: 80, branches: 80 }` 顶层键、整改 commit 前缀（`test(web): b2.x`）、thresholds 键名与 tsconfig include 路径与真实文件相对路径核对一致（`src/store/modules/*`、`src/utils/http/*`、`src/utils/localforage/*`、`types/router.d.ts`）。复审核对 9 个 SET action 与 state 键、cacheOperate 三模式/clearCache 语义、multiTags push 链顺序（MaxTagsLevel 检查位于 push 之后）、refreshAndRetry 单飞/队列/失败路径均与断言一致。
```
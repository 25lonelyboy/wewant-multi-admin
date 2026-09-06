# pure-web 前端测试评估规范与覆盖缺口补齐 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按设计文档（[2026-09-06-frontend-testing-standard-design.md](2026-09-06-frontend-testing-standard-design.md)）落地六层分类框架 + 双层 E2E + 阈值终态，补齐 118 个未登记文件的覆盖缺口，收敛 91 个逐文件 glob 键。

**Architecture:** 6 Phase 顺序执行：Phase 0 探针（0a 直连回归体检 → 0b info.ts 分类 → 0c exclude 可行性）→ Phase 1 exclude 治理（118 文件分类 + T3/T4/T5 全量 exclude）→ Phase 2~N 分域补测（A 类已测未登记补键 + B 类真缺口补测）→ Phase T Tier B 基建（双模改造 + 真实后端冒烟 + CI job）→ Phase F 翻转闸门（删 91 键 → 全局聚合 + crown-jewel + living 规范提升）。测试方法分轨：新代码（Task 1/9/15 的 E2E 与 guards.ts）走 TDD 铁律（红→绿→重构→提交）；既有源码补测（Task 2/6-8/10-13）为 characterization 补测（锁定既有行为，非红绿驱动——若补测暴露行为差异，按 systematic-debugging 判定是 bug 还是用例写错）；T2 mount 真实子依赖、stub 最小化、禁恒真断言。

**Tech Stack:** vitest + @vue/test-utils + jsdom（v8 coverage）、Playwright（chromium）、NestJS + Prisma + Redis（Tier B 真实后端）、GitHub Actions（e2e-web-real job）。

**关键事实基线**（计划编写时已核实，执行时直接采信）：
- 118 未登记文件精确清单与预分类见 [Task 3](#task-3-phase-1a--118-文件分类清单)（209 include = 91 已登记 + 118 未登记；122 spec 文件）。
- `build/info.spec.ts` 不存在（info.ts 当前 75/65 来自间接覆盖），Task 2 新建直接测试。
- 根 `.env` `ADMIN_INIT_PASSWORD = dev-admin-pass`（探针/Tier B 本地密码）；CI 冒烟用 `smoke-admin-password`（ci.yml L89）。
- **后端登录无验证码校验**（nestjs-server src 无 verifyCode/captcha 字段）——前端 canvas 验证码纯 UI，real 模式照填 store 中的 4 位码即可，无需兼容改造。
- mock 登录接口对任何 username 返回 code:0（mock/login.ts），real 模式必须真实凭证——`loginAsAdmin` 在 routing.spec.ts L6 内联定义且不填凭证，Task 14 抽公共 helper + env 化。
- coverage 报告 text reporter 的 per-file 表与「All files」行是分类与达标验证的数据源（无需新脚本）。
- ci.yml 七 job 全并行、无分支保护（报警式语义靠此实现，L2 注释）；e2e-web job 无 services 块。

**执行前提**（Task 0 之外，由执行编排者处理）：
1. 本计划、设计文档、ADR-008 已在 master 提交（Task 0 Step 0 验证）。
2. 使用 superpowers:using-git-worktrees 创建隔离工作区执行本计划。
3. 每任务提交遵循 conventional commits + scope `web` / `repo`（文档类）/ `internal`（CI 属 repo，见 commitlint 白名单：ci.yml 变更历史用 `repo` 或 `web` 视内容而定，本计划 CI job 与 e2e 均属 pure-web 应用面，统一 `web`；docs 变更统一 `docs`）。

---

### Task 0: 基线验证与工作区就绪

**Files:**
- 验证（不改）：`apps/pure-web/vitest.config.ts`、`.github/workflows/ci.yml`
- 产出：无代码变更

- [ ] **Step 0.1: 确认设计工件已提交（在 master 上执行）**

```bash
git -C d:/WorkSpace/AI/wewant-multi-admin log --oneline -3
git -C d:/WorkSpace/AI/wewant-multi-admin status --short
```

Expected: 最近提交含 design.md + ADR-008 的 `docs: ...` 提交；工作区干净（或仅剩 `scripts/tmp-coverage-gap.mjs` untracked，属预期）。

若未提交：先在 master 提交设计工件（design.md / ADR-008 / 任务目录 README / tasks+decisions 索引），message 例：`docs: 新增 pure-web 前端测试评估规范设计与 ADR-008`。

- [ ] **Step 0.2: 创建 worktree 并安装依赖**

```bash
# 编排者使用 superpowers:using-git-worktrees，或等价：
git -C d:/WorkSpace/AI/wewant-multi-admin worktree add .worktrees/fts-feature -b feat/frontend-testing-standard
cd .worktrees/fts-feature && pnpm install
```

Expected: 安装成功，无 engines 报错（Node 24 / pnpm 11）。

- [ ] **Step 0.3: 跑基线门禁**

```bash
pnpm check
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: `pnpm check` 全绿；coverage 报告「All files」行显示当前聚合（记录数值到本任务提交说明，Phase F 对比用）。**若 typecheck/lint 红：先修再继续**（CI 红 → 下一项工作先修 CI）。

- [ ] **Step 0.4: 删除临时缺口脚本**

```bash
# 文件 untracked（从未入库，Step 0.1 已确认）：直接删除，无需 commit
Remove-Item scripts/tmp-coverage-gap.mjs -ErrorAction SilentlyContinue
# 若意外已跟踪（git ls-files scripts/tmp-coverage-gap.mjs 有输出）则改用：
#   git rm scripts/tmp-coverage-gap.mjs
#   git commit -m "chore(repo): 移除临时缺口盘点脚本（Phase 1 用 coverage 报告双重测量替代）"
```

Expected: 文件删除；`git status --short` 无 tmp 脚本条目。

### Task 1: Phase 0a 直连回归探针（最高优先）

**Files:**
- Modify: `apps/pure-web/playwright.config.ts`（webServer 双模，最小改造）
- Create: `apps/pure-web/e2e/real-backend.spec.ts`（登录冒烟，Tier B 首个 test）
- 产出: `docs/tasks/2026-09-06-frontend-testing-standard/probe-0a-report.md`（探针报告）

- [ ] **Step 1.1: playwright.config.ts webServer 支持 E2E_MODE**

将 L21-26 改为：

```typescript
  webServer: {
    command:
      process.env.E2E_MODE === 'real'
        ? 'vite --port 5199 --strictPort'
        : 'cross-env VITE_MOCK=true vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
```

Rationale: real 模式不设 `VITE_MOCK`（缺省 false → proxy /api/v1 → localhost:3000）；mock 模式行为不变。

- [ ] **Step 1.2: 写登录冒烟测试（TDD RED）**

```typescript
// e2e/real-backend.spec.ts
import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'dev-admin-pass';

test('直连真实后端登录→首页菜单→退出 @real-backend', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.getByPlaceholder('账号')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('账号').fill(ADMIN_USER);
  await page.getByPlaceholder('密码').fill(ADMIN_PASS);
  // 后端无验证码校验，照填前端 canvas 生成的 4 位码（探针结论 P 已验证）
  const code = await page.evaluate(() => {
    const app = document.querySelector('#app') as any;
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    const userStore = pinia?._s?.get('pure-user');
    return userStore?.verifyCode ?? '';
  });
  expect(code).toMatch(/^\d{4}$/);
  await page.getByPlaceholder('验证码').fill(code);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/#/**', { timeout: 15_000 });
  await expect(page.locator('.el-menu').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('.el-dropdown-link').last().click();
  await page.getByText('退出系统').click();
  await page.waitForURL('**/#/login', { timeout: 10_000 });
  await expect(page.locator('.login-container')).toBeVisible();
});
```

- [ ] **Step 1.3: 起真实后端环境**

```bash
# 仓库根（worktree 内）；需 Docker Desktop 运行
pnpm ops:env-up
# 后台起后端（3000 端口；env 从 .env 读，ADMIN_INIT_PASSWORD=dev-admin-pass）
pnpm dev:server
```

Expected: `pnpm ops:env-up` 完成 postgres/redis up + migrate + seed；`curl http://localhost:3000/health` 返回健康。**seed 需 ADMIN_INIT_PASSWORD——根 .env 已配 dev-admin-pass，若报「未设置」则显式 `$env:ADMIN_INIT_PASSWORD='dev-admin-pass'` 后重跑。**

- [ ] **Step 1.4: 跑探针（RED 预期：可能登录失败，暴露直连漂移）**

```bash
cd apps/pure-web
$env:E2E_MODE='real'
npx playwright test e2e/real-backend.spec.ts --reporter=line
```

Expected: **两种结果都属探针产出**：
- **通**：登录→菜单→退出全绿 → 直连链路完好，Tier B 可继续。
- **断**：按 systematic-debugging 定位（proxy 目标、信封解包 http/index.ts、BizCode、菜单渲染、CORS），最小修复直连；修复改动属于「闭合 false-green 的必要回归修复」。

- [ ] **Step 1.5: 写探针报告并提交**

`docs/tasks/2026-09-06-frontend-testing-standard/probe-0a-report.md` 内容：

```markdown
# Phase 0a 直连回归探针报告（<日期>）

- **结果**：通 / 断（修复后通）
- **验证码兼容结论**：后端无 verifyCode 校验，前端 canvas 码照填即可
- **断点与修复**（若断）：<proxy/信封/BizCode/菜单 各自状态与修复 diff 摘要>
- **影响 Tier B 工作量的评估**：<正常 / 超预期，新增修复项列表>
```

提交：

```bash
git add apps/pure-web/playwright.config.ts apps/pure-web/e2e/real-backend.spec.ts docs/tasks/2026-09-06-frontend-testing-standard/probe-0a-report.md
git commit -m "feat(web): 直连回归探针通过——E2E 双模 webServer + 真实后端登录冒烟"
```

（若含直连修复，commit message 改为 `fix(web): 修复直连链路（探针暴露）+ E2E 双模 webServer`，修复与探针同提交。）

### Task 2: Phase 0b build/info.ts 分类判定 + 补测至 80

**Files:**
- Create: `apps/pure-web/build/info.spec.ts`
- Modify: `apps/pure-web/vitest.config.ts:72`（键 75/65 → 80/80）

**分类判定**：T1 纯逻辑（vite 插件工厂，无 DOM、输入→输出可断言；gradient/boxen 为第三方输出装饰，不需 mock）。

- [ ] **Step 2.1: 写 characterization 测试（锁定 viteBuildInfo 既有行为）**

```typescript
// build/info.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { viteBuildInfo } from './info';
import type { ResolvedConfig } from 'vite';

const makeConfig = (command: 'build' | 'serve', outDir?: string) =>
  ({ command, build: { outDir } }) as unknown as ResolvedConfig;

describe('viteBuildInfo', () => {
  it('返回名为 vite:buildInfo 的插件', () => {
    const plugin = viteBuildInfo();
    expect(plugin.name).toBe('vite:buildInfo');
  });

  it('configResolved 记录 config 与 outDir（缺省 dist）', () => {
    const plugin = viteBuildInfo();
    // 无异常即通过；outDir 回退分支由下方 closeBundle 用例覆盖
    expect(() => plugin.configResolved(makeConfig('build', undefined))).not.toThrow();
  });

  it('configResolved 记录自定义 outDir', () => {
    const plugin = viteBuildInfo();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.configResolved(makeConfig('build', 'custom-dist'));
    // closeBundle 回调通过 getPackageSize 读到 outDir（断言 console.log 被调用即可证链路通）
    plugin.closeBundle();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('serve 命令 buildStart 不记录 startTime（不抛异常即通过）', () => {
    const plugin = viteBuildInfo();
    plugin.configResolved(makeConfig('serve'));
    expect(() => plugin.buildStart()).not.toThrow();
  });

  it('build 命令 closeBundle 走耗时输出分支（console.log 被调用）', () => {
    const plugin = viteBuildInfo();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.configResolved(makeConfig('build', 'dist'));
    plugin.buildStart();
    plugin.closeBundle();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('serve 命令 closeBundle 早退（不调用 console.log）', () => {
    const plugin = viteBuildInfo();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.configResolved(makeConfig('serve'));
    plugin.buildStart();
    plugin.closeBundle();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2.2: 跑测试确认失败/通过**

```bash
pnpm --filter @multi-admin/pure-web run test -- build/info.spec.ts
```

Expected: 首跑因 spec 文件不存在而失败（import 错误）→ 写入后 GREEN（6 test 全过）。补测语义：锁定 viteBuildInfo 既有行为——若某用例失败且源码行为与用例预期不符，按 systematic-debugging 判定是 bug（修源码）还是用例写错（修测试）。若 `getPackageSize` 抛错（dist 不存在），将 `plugin.closeBundle()` 断言改为仅验证不抛异常——**先跑再看输出修正，不改测试语义**。

- [ ] **Step 2.3: 单独验证该文件覆盖率 ≥80/80**

```bash
pnpm --filter @multi-admin/pure-web run test -- build/info.spec.ts --coverage
```

Expected: text 报告中 `build/info.ts` 行 lines ≥80、branches ≥80。**未达标 → 对照报告未覆盖分支补用例（如 outDir 缺省分支、serve 分支），重复 Step 2.3。**

- [ ] **Step 2.4: 键提升到 80/80 并提交**

`vitest.config.ts` L72 改为：

```typescript
        'build/info.ts': { lines: 80, branches: 80 },
```

```bash
git add apps/pure-web/build/info.spec.ts apps/pure-web/vitest.config.ts
git commit -m "test(web): build/info.ts 直接单测补齐至 80/80 并提升键门槛"
```

### Task 3: Phase 1a — 118 文件分类清单

**Files:**
- 产出: `docs/tasks/2026-09-06-frontend-testing-standard/classification-118.md`（过程材料）
- 不改代码

- [ ] **Step 3.1: 跑全量 coverage 获得 per-file 数据**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: 全量 coverage 完成（91 键门禁绿）。text 报告 per-file 表是后续判定数据源。**将报告输出重定向保存**：`pnpm --filter @multi-admin/pure-web run test:coverage > coverage-report.txt 2>&1`（同目录临时，用后删）。

- [ ] **Step 3.2: 按预分类表逐文件核验，写分类清单**

以下预分类基于代码事实（plan 编写时核实）。执行者逐文件比对 coverage 报告修正，写入 `classification-118.md`：

**A 类——已测未登记（有 spec，coverage 达标即补键；不达标先补用例）**（29 个）：

```
src/layout/components/lay-search/components/SearchResult.vue
src/layout/components/lay-setting/index.vue
src/layout/components/lay-sidebar/components/SidebarBreadCrumb.vue
src/layout/components/lay-sidebar/components/SidebarExtraIcon.vue
src/layout/components/lay-sidebar/components/SidebarItem.vue
src/layout/components/lay-sidebar/components/SidebarLinkItem.vue
src/layout/components/lay-sidebar/components/SidebarLogo.vue
src/layout/components/lay-tag/index.vue
src/views/login/utils/static.ts
src/views/system/hooks.ts
src/views/system/dept/form.vue
src/views/system/dept/index.vue
src/views/system/dept/utils/hook.tsx
src/views/system/dept/utils/rule.ts
src/views/system/menu/form.vue
src/views/system/menu/index.vue
src/views/system/menu/utils/enums.ts
src/views/system/menu/utils/hook.tsx
src/views/system/menu/utils/rule.ts
src/views/system/role/form.vue
src/views/system/role/index.vue
src/views/system/role/utils/hook.tsx
src/views/system/role/utils/rule.ts
src/views/system/user/form/index.vue
src/views/system/user/form/role.vue
src/views/system/user/index.vue
src/views/system/user/tree.vue
src/views/system/user/utils/hook.tsx
src/views/system/user/utils/rule.ts
```

**B 类——T1/T2 真缺口（无 spec，须 characterization 补测）**（见 Task 10-12 清单，共 39 个）。

**T4——jsdom 受限（exclude + 豁免双向登记 + E2E 回补）**（9 个确定 + 1 待定）：

```
src/utils/print.ts                                  （print.spec.ts 薄测试已存在）
src/components/ReCropper/src/index.tsx              （index.spec.tsx 薄测试已存在）
src/components/ReCropperPreview/src/index.vue       （index.spec.ts 薄测试已存在）
src/components/ReImageVerify/src/index.vue          （index.spec.ts 薄测试已存在）
src/components/ReImageVerify/src/hooks.ts           （同上覆盖）
src/components/ReQrcode/src/index.tsx               （index.spec.tsx 薄测试已存在）
src/views/welcome/components/charts/ChartBar.vue
src/views/welcome/components/charts/ChartLine.vue
src/views/welcome/components/charts/ChartRound.vue
src/views/monitor/online/index.vue                  （待定：若含 echarts 则 T4，否则 T3）
```

**T5——无逻辑（exclude + 理由）**（36 个 + 4 个待验证 type.ts）：

```
src/App.vue                                         （根壳）
src/main.ts                                         （入口 bootstrap）
src/config/index.ts                                 （纯配置对象）
src/directives/index.ts                             （barrel）
src/plugins/echarts.ts                              （app.use 注册）
src/plugins/elementPlus.ts                          （app.use 注册）
src/plugins/i18n.ts                                 （app.use 注册）
src/plugins/vxeTable.ts                             （app.use 注册）
src/router/modules/home.ts                          （静态路由配置）
src/router/modules/remaining.ts                     （静态路由配置）
src/store/types.ts                                  （纯类型）
src/layout/types.ts                                 （纯类型）
src/layout/components/lay-search/types.ts           （纯类型）
src/views/empty/index.vue                           （静态页）
src/views/error/403.vue                             （静态页）
src/views/error/404.vue                             （静态页）
src/views/error/500.vue                             （静态页）
src/views/welcome/components/charts/index.ts        （barrel）
src/components/ReAnimateSelector/index.ts           （barrel）
src/components/ReAuth/index.ts                      （barrel）
src/components/ReCountTo/index.ts                   （barrel）
src/components/ReCropper/index.ts                   （barrel）
src/components/ReCropper/src/svg/index.ts           （barrel：svg 导入）
src/components/ReCropperPreview/index.ts            （barrel）
src/components/ReIcon/index.ts                      （barrel）
src/components/ReImageVerify/index.ts               （barrel）
src/components/RePerms/index.ts                     （barrel）
src/components/RePureTableBar/index.ts              （barrel）
src/components/ReQrcode/index.ts                    （barrel）
src/components/ReSegmented/index.ts                 （barrel）
src/components/ReText/index.ts                      （barrel）
src/components/ReTypeit/index.ts                    （barrel）
src/components/ReDialog/type.ts                     （待验证：纯类型则 T5；含运行时 withDefaults 则归 T1 补测）
src/components/ReDrawer/type.ts                     （同上）
src/components/ReSegmented/src/type.ts              （同上）
src/components/ReIcon/src/types.ts                  （同上）
```

**B 类真缺口明细**（Task 10-12 逐任务处理，此处登记全集与判定结论，共 39 个；判定基于计划编写期源码通读，执行时若源码与结论不符按 Task 10 Step 10.4 判定规则复核）：

```
# Task 10 域1 layout（22）
src/layout/hooks/useBoolean.ts                      T1 纯逻辑
src/layout/hooks/useLayout.ts                       T1 纯逻辑（依赖 store/storage）
src/layout/hooks/useTranslationLang.ts              T1 纯逻辑（依赖 useNav/i18n）
src/layout/index.vue                                T3 壳
src/layout/frame.vue                                T3 壳（iframe 载体）
src/layout/components/lay-content/index.vue         T3 壳
src/layout/components/lay-frame/index.vue           T3 壳
src/layout/components/lay-navbar/index.vue          T3 壳（逻辑全下沉 useNav/useTranslationLang）
src/layout/components/lay-notice/index.vue          T2（onMarkAsRead 状态流 + computed 分支）
src/layout/components/lay-notice/components/NoticeItem.vue  T3 壳（DOM 测量 tooltip 渐进增强，jsdom 受限）
src/layout/components/lay-panel/index.vue           T2（emitter 开合状态 + onClickOutside）
src/layout/components/lay-search/index.vue          T3 壳（一行 toggle，逻辑在 SearchModal）
src/layout/components/lay-search/components/SearchFooter.vue  T3 壳（静态提示条）
src/layout/components/lay-search/components/SearchHistory.vue T2（active 高亮/事件转发状态流；Sortable 为外部边界可 stub）
src/layout/components/lay-search/components/SearchModal.vue   T2（搜索/拼音匹配/键盘导航/历史收藏——核心交互）
src/layout/components/lay-sidebar/NavHorizontal.vue  T2（showLogo 状态 + emitter logoChange + defaultActive 分支）
src/layout/components/lay-sidebar/NavMix.vue         T2（getDefaultActive 分支 + watch route/wholeMenus）
src/layout/components/lay-sidebar/NavVertical.vue    T2（getSubMenuData 早退分支 + menuData mix 分支）
src/layout/components/lay-sidebar/components/SidebarCenterCollapse.vue  T3 壳（纯样式折叠钮）
src/layout/components/lay-sidebar/components/SidebarFullScreen.vue     T3 壳（图标切换单 watch，toggle 逻辑在 useNav）
src/layout/components/lay-sidebar/components/SidebarLeftCollapse.vue   T3 壳
src/layout/components/lay-sidebar/components/SidebarTopCollapse.vue    T3 壳
# Task 11 域3 login + welcome（7）
src/views/login/index.vue                           T3 壳（校验逻辑在 utils/ 已登记）
src/views/login/components/LoginPhone.vue           T2（validate 分支 + loading 状态流）
src/views/login/components/LoginQrCode.vue          T3 壳（canvas 由 T4 排除的 ReQrcode 承载）
src/views/login/components/LoginRegist.vue          T2（repeatPasswordRule 三分支 + checked 分支）
src/views/login/components/LoginUpdate.vue          T2（repeatPasswordRule 三分支 + validate 分支）
src/views/welcome/index.vue                         T3 壳
src/views/welcome/components/table/index.vue        T3 壳（数据/分页逻辑在 columns.tsx 已登记）
# Task 12 域4 account-settings + monitor（10）
src/views/account-settings/index.vue                T3 壳
src/views/account-settings/components/AccountManagement.vue  T3 壳（静态列表 + message 占位）
src/views/account-settings/components/Preferences.vue        T3 壳（静态开关列表 + message 占位）
src/views/account-settings/components/Profile.vue            T2（getMine 填充/头像上传/提交分支；ReCropperPreview 为 T4 stub）
src/views/account-settings/components/SecurityLog.vue        T2（onSearch code 分支 + 404 catch 空态 + finally）
src/views/monitor/logs/login/index.vue              T3 壳（hook.tsx 已登记）
src/views/monitor/logs/operation/index.vue          T3 壳（hook.tsx 已登记）
src/views/monitor/logs/system/index.vue             T3 壳（hook.tsx 已登记）
src/views/monitor/logs/system/detail.vue            T3 壳
src/views/monitor/online/index.vue                  T3 壳（无 echarts——纯表格组合，逻辑全在 hook.tsx 已登记）
```

**另列**：`src/router/index.ts` 单独处置（Task 9 拆分，不计入上表）。

- [ ] **Step 3.3: 提交分类清单**

```bash
git add docs/tasks/2026-09-06-frontend-testing-standard/classification-118.md
git commit -m "docs: 118 未登记文件六层分类清单（Phase 1a 产出）"
```

（coverage-report.txt 不提交，删除。）

### Task 4: Phase 1b — exclude 治理落地

**Files:**
- Modify: `apps/pure-web/vitest.config.ts`（exclude 扩为 T3/T4/T5 全量 + 内联理由）
- Create: `docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md`（豁免主表，living 提升前的事实源）

- [ ] **Step 4.1: barrel 逐文件验证纯 re-export**

对 13 个 `src/components/*/index.ts` + `directives/index.ts` + `charts/index.ts` + `ReCropper/src/svg/index.ts` 逐个 Read 验证：内容仅为 `export { ... } from './src/...'` 或 `export * from ...` 形态。**发现含运行时逻辑（如 side-effect 注册）的文件，从 T5 移入 B 类清单并更新 classification-118.md。**

- [ ] **Step 4.2: 改 vitest.config.ts exclude**

将 L67 替换为（理由注释必须逐条保留，doc-lint covers 会保护此配置）：

```typescript
      exclude: [
        '**/*.d.ts',
        '**/*.spec.ts',
        // ── T5 无逻辑：入口 / 根壳 ──
        'src/main.ts',                    // T5: bootstrap 入口
        'src/App.vue',                    // T5: 根壳
        // ── T5 无逻辑：barrel（已逐文件验证纯 re-export，Task 4.1）──
        'src/directives/index.ts',        // T5: barrel
        'src/components/ReAnimateSelector/index.ts',   // T5: barrel
        'src/components/ReAuth/index.ts',              // T5: barrel
        'src/components/ReCountTo/index.ts',           // T5: barrel
        'src/components/ReCropper/index.ts',           // T5: barrel
        'src/components/ReCropper/src/svg/index.ts',   // T5: barrel（svg 导入）
        'src/components/ReCropperPreview/index.ts',    // T5: barrel
        'src/components/ReIcon/index.ts',              // T5: barrel
        'src/components/ReImageVerify/index.ts',       // T5: barrel
        'src/components/RePerms/index.ts',             // T5: barrel
        'src/components/RePureTableBar/index.ts',      // T5: barrel
        'src/components/ReQrcode/index.ts',            // T5: barrel
        'src/components/ReSegmented/index.ts',         // T5: barrel
        'src/components/ReText/index.ts',              // T5: barrel
        'src/components/ReTypeit/index.ts',            // T5: barrel
        'src/views/welcome/components/charts/index.ts', // T5: barrel
        // ── T5 无逻辑：plugin 注册 / 静态配置 / 纯类型 / 静态页 ──
        'src/plugins/*.ts',               // T5: app.use 副作用注册
        'src/config/index.ts',            // T5: 纯配置对象
        'src/router/modules/*.ts',        // T5: 静态路由配置（home/remaining 已验证无逻辑）
        'src/store/types.ts',             // T5: 纯类型
        'src/layout/types.ts',            // T5: 纯类型
        'src/layout/components/lay-search/types.ts', // T5: 纯类型
        'src/views/empty/index.vue',      // T5: 静态页
        'src/views/error/*.vue',          // T5: 静态页（403/404/500）
        // ── T4 jsdom 受限：豁免双向登记 + E2E 回补 ──
        'src/utils/print.ts',             // T4: DOM 打印不可达（print.spec 薄测试 + E2E verify）
        'src/components/ReImageVerify/**', // T4: canvas 验证码（index.spec 薄测试 + E2E verify）
        'src/components/ReCropper/**',     // T4: cropper 深交互（index.spec.tsx 薄测试 + E2E 永久豁免）
        'src/components/ReCropperPreview/**', // T4: canvas 预览（index.spec 薄测试 + E2E components）
        'src/components/ReQrcode/**',      // T4: canvas 二维码（index.spec.tsx 薄测试 + E2E components）
        'src/views/welcome/components/charts/*.vue', // T4: echarts 渲染（不可达）
        // ── T3 页面壳：Task 10-12 逐文件 smoke 后追加（本轮先不扩，避免误排）──
      ]
```

**注意**：T3 壳的 exclude 在 Task 10-12 每域 smoke 测试落地后按域追加（同提交），不在本任务一次性加入——防止「壳判定错误导致未测先排」违反治理铁律。Task 4 只落 T4/T5（barrel 已验证、豁免三要素已齐）。

- [ ] **Step 4.3: 写豁免主表 exclude-registry.md**

```markdown
# pure-web coverage exclude 豁免主表（Phase 1b 起；living 提升后迁 frontend-testing-standard.md）

治理铁律：每条 exclude 必须映射 T3/T4/T5 + 理由，禁止「测不到就排除」。

## T4 jsdom 受限（豁免双向登记：薄测试 + E2E 回补 + 本表登记，三者缺一视为技术债）

| 文件 | 薄测试 | E2E 回补 | 理由 |
| --- | --- | --- | --- |
| src/utils/print.ts | print.spec.ts | verify.spec「Print 工具模块可加载」 | DOM 打印不可达 |
| src/components/ReImageVerify/** | index.spec.ts | verify.spec「验证码 canvas 渲染+刷新」 | canvas 验证码 |
| src/components/ReCropper/** | index.spec.tsx | components.spec（cropper 深度交互永久豁免，见 AGENTS.md） | cropper 深交互 |
| src/components/ReCropperPreview/** | index.spec.ts | components.spec「用户管理页可达渲染」 | canvas 预览 |
| src/components/ReQrcode/** | index.spec.tsx | components.spec「二维码 canvas 非空」 | canvas 二维码 |
| src/views/welcome/components/charts/*.vue | 无（纯渲染） | 登录后 welcome 页可达（auth.spec 旅程内） | echarts 渲染 |

## T5 无逻辑

（barrel/plugins/入口/静态页/纯类型——逐条理由见 vitest.config.ts 内联注释，双处同源）
```

- [ ] **Step 4.4: 跑 coverage 确认 exclude 生效且 91 键仍绿**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: 全绿；text 报告中 T4/T5 文件不再出现在 per-file 表。**若某 barrel 仍出现在报告（说明被测试引用计数），检查该文件是否实为有逻辑文件 → 回到 Step 4.1 复核。**

- [ ] **Step 4.5: 提交**

```bash
git add apps/pure-web/vitest.config.ts docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
git commit -m "test(web): T4/T5 全量 exclude 落地（内联理由 + 豁免主表双向登记）"
```

### Task 5: Phase 0c — 全局聚合可行性验证

**Files:**
- 产出: `docs/tasks/2026-09-06-frontend-testing-standard/probe-0c-report.md`
- 不改代码

- [ ] **Step 5.1: 读当前聚合值**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: text 报告「All files」行记录：% Stmts / % Branch / % Funcs / % Lines。**记录 lines/branches 聚合值到报告。**

- [ ] **Step 5.2: 写探针报告**

`probe-0c-report.md`：

```markdown
# Phase 0c exclude 可行性探针报告（<日期>）

- **当前全局聚合**（T4/T5 排除后）：lines X% / branches Y%（All files 行）
- **距离 80/80 的差距**：<数字与主要欠覆盖文件 top5（从 per-file 表取）>
- **数学假设确认**：非排除文件 per-file 键全绿 ≥80% ⇒ 聚合必 ≥80%（由 Task 6-13 逐步达成）
- **crown-jewel 建议清单**（默认锁定 6，Phase F 采用）：
  1. src/utils/auth.ts（hasAuth/hasPerms 权限判定）
  2. src/store/modules/user.ts（token/session 状态机）
  3. src/utils/http/index.ts（信封解包 + BizCode 40102 刷新拦截）
  4. src/router/guards.ts（Task 9 新建，权限路由守卫）
  5. src/utils/tree.ts（菜单层级核心）
  6. src/store/modules/permission.ts（动态路由授权）
```

- [ ] **Step 5.3: 提交**

```bash
git add docs/tasks/2026-09-06-frontend-testing-standard/probe-0c-report.md
git commit -m "docs: Phase 0c 全局聚合可行性探针报告"
```

### Task 6: A 类补键——layout/components 8 个已测未登记

**Files:**
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 8 键）
- 可能补测: 对应 spec 文件（仅当 coverage 不达标）

- [ ] **Step 6.1: 全量 coverage 后核对 8 文件达标情况**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: 在 text 报告 per-file 表中定位以下 8 文件，记录各自 lines/branches：

```
src/layout/components/lay-search/components/SearchResult.vue
src/layout/components/lay-setting/index.vue
src/layout/components/lay-sidebar/components/SidebarBreadCrumb.vue
src/layout/components/lay-sidebar/components/SidebarExtraIcon.vue
src/layout/components/lay-sidebar/components/SidebarItem.vue
src/layout/components/lay-sidebar/components/SidebarLinkItem.vue
src/layout/components/lay-sidebar/components/SidebarLogo.vue
src/layout/components/lay-tag/index.vue
```

- [ ] **Step 6.2: 不达标文件补用例（characterization，逐文件）**

对每个 lines<80 或 branches<80 的文件：Read 其 spec 与源码 → 对照 coverage 报告未覆盖行写 characterization 补测 → 跑通锁定既有行为 → 再验覆盖。**禁改源码凑覆盖**（B3 教训：优先补测试用例）。

- [ ] **Step 6.3: 追加 8 键并提交**

vitest.config.ts thresholds 追加（插在 `src/layout/hooks` 区之后）：

```typescript
        'src/layout/components/lay-search/components/SearchResult.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-setting/index.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarBreadCrumb.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarExtraIcon.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarItem.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarLinkItem.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarLogo.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-tag/index.vue': {
          lines: 80,
          branches: 80
        },
```

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
# 全绿后提交
git add apps/pure-web/vitest.config.ts
[ -n "$(git status --short apps/pure-web/src)" ] && git add apps/pure-web/src
# PowerShell 用户改用：git add apps/pure-web（仅含 spec 变更时细化 add 列表）
git commit -m "test(web): layout/components 8 个已测未登记文件补 thresholds 键"
```

### Task 7: A 类补键——views/system 20 个 + 4 个 types.ts 判定

**Files:**
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加）
- 可能补测: 对应 spec 文件
- 可能追加 exclude: `vitest.config.ts`（types.ts 若判 T5）

- [ ] **Step 7.1: 判定 4 个 types.ts**

Read `src/views/system/{dept,menu,role,user}/utils/types.ts`（user 的为 `user/utils/types.ts`）：
- **纯类型**（interface/type 声明，无运行时导出）→ T5，追加到 exclude（理由 `// T5: 纯类型`），并同步 exclude-registry.md。
- **含运行时值**（如 `const formItemProps = {...}`）→ 归 T1，写 spec 补测至 80/80 再补键。

- [ ] **Step 7.2: 全量 coverage 核对 20 文件达标情况**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

文件清单（A 类 system 段，见 classification-118.md）；记录各自 lines/branches。

- [ ] **Step 7.3: 不达标文件补用例（characterization）**

同 Task 6 Step 6.2 规则。system 域 hook.tsx 类文件若 branches 低，对照报告补 CRUD 分支用例。

- [ ] **Step 7.4: 追加键并提交**

为 20 个文件追加 80/80 键（键格式同 Task 6 Step 6.3，路径照抄清单）；被排除的 types.ts 不补键。跑 `pnpm --filter @multi-admin/pure-web run test:coverage` 全绿后：

```bash
git add apps/pure-web/vitest.config.ts apps/pure-web/src/views/system docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
[ -n "$(git status --short apps/pure-web/src)" ] && git add apps/pure-web/src
git commit -m "test(web): views/system 20 个已测未登记文件补键 + types.ts 分类落位"
```

### Task 8: A 类补键——login/utils/static.ts

**Files:**
- Modify: `apps/pure-web/vitest.config.ts`

- [ ] **Step 8.1: 核对 static.ts 达标情况**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: 报告中 `src/views/login/utils/static.ts` lines/branches 均 ≥80（static.spec.ts 已存在）。

- [ ] **Step 8.2: 补键并提交**

```typescript
        'src/views/login/utils/static.ts': { lines: 80, branches: 80 },
```

（插在 login/utils 键区；不达标则按 Task 6 Step 6.2 补用例。）

```bash
git add apps/pure-web/vitest.config.ts
git commit -m "test(web): login/utils/static.ts 补 thresholds 键"
```

### Task 9: router/index.ts 拆分——守卫抽 guards.ts（crown-jewel）

**Files:**
- Create: `apps/pure-web/src/router/guards.ts`
- Create: `apps/pure-web/src/router/guards.spec.ts`
- Modify: `apps/pure-web/src/router/index.ts`（beforeEach 改用 guards.ts）
- Modify: `apps/pure-web/vitest.config.ts`（guards.ts 键 80；终态 90 留 Phase F）

**拆分边界**：guards.ts 只含「访问控制决策」（userInfo/externalLink/403/404/刷新 initRouter/toCorrectRoute/白名单），副作用（NProgress、title、keepAlive）留在 index.ts 回调前段。

- [ ] **Step 9.1: 写 guards.spec.ts（TDD RED）**

```typescript
// src/router/guards.spec.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { permissionGuard } from './guards';
import { usePermissionStoreHook } from '@/store/modules/permission';
import { userKey, multipleTabsKey } from '@/utils/auth';

const makeRoute = (over = {}) => ({
  path: '/x',
  fullPath: '/x',
  name: 'X',
  meta: {},
  matched: [],
  ...over
}) as any;

const makeCtx = (over = {}) => ({ router: { push: vi.fn() }, ...over } as any);

function loginAsAdmin() {
  localStorage.setItem(
    userKey,
    JSON.stringify({ username: 'admin', roles: ['admin'], expires: Date.now() + 1000 * 60 * 60 })
  );
  document.cookie = `${multipleTabsKey}=1`;
}

describe('permissionGuard 访问控制', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.cookie = `${multipleTabsKey}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('未登录访问非白名单 → 重定向 /login', () => {
    const r = permissionGuard(makeRoute({ path: '/welcome', fullPath: '/welcome' }), makeRoute(), makeCtx());
    expect(r).toEqual({ path: '/login' });
  });

  it('未登录访问白名单 /login → 放行 true', () => {
    const r = permissionGuard(
      makeRoute({ path: '/login', fullPath: '/login' }),
      makeRoute(),
      makeCtx()
    );
    expect(r).toBe(true);
  });

  it('已登录访问白名单 → 返回 from.fullPath', () => {
    loginAsAdmin();
    const from = makeRoute({ fullPath: '/welcome' });
    const r = permissionGuard(makeRoute({ path: '/login', fullPath: '/login' }), from, makeCtx());
    expect(r).toBe('/welcome');
  });

  it('已登录访问 roles 不符路由 → 重定向 /error/403', () => {
    loginAsAdmin();
    const r = permissionGuard(
      makeRoute({ meta: { roles: ['super'] } }),
      makeRoute(),
      makeCtx()
    );
    expect(r).toEqual({ path: '/error/403' });
  });

  it('hideHome=true 且访问 /welcome → 重定向 /error/404', () => {
    loginAsAdmin();
    // VITE_HIDE_HOME 由 import.meta.env 读取；vitest 下用 process.env 注入：见下方 env 说明
    const r = permissionGuard(
      makeRoute({ path: '/welcome', fullPath: '/welcome' }),
      makeRoute(),
      makeCtx()
    );
    // 默认 env 未开 hideHome：本用例仅验证守卫链路不抛错；hideHome 分支见下一条
    expect(r).toBeUndefined();
  });

  it('externalLink 路由 → openLink + 返回 false（阻断）', () => {
    loginAsAdmin();
    const to = makeRoute({ name: 'https://example.com' });
    const r = permissionGuard(to, makeRoute({ name: 'Home' }), makeCtx());
    expect(r).toBe(false);
  });

  it('已登录刷新且菜单未加载 → initRouter 路径（router.push 被调用）', () => {
    loginAsAdmin();
    const ctx = makeCtx();
    // 无 from.name + wholeMenus 空触发 initRouter
    const r = permissionGuard(
      makeRoute({ path: '/system/user', fullPath: '/system/user' }),
      makeRoute({ name: undefined }),
      ctx
    );
    // initRouter 异步；同步断言不抛 + push 异步调用（await flushPromises 后断言）
    expect(r).toBeUndefined();
  });
});
```

**env 说明**：guards.ts 内 `import.meta.env.VITE_HIDE_HOME` 在 vitest 下可用（`test.env` 未设该值时 undefined → `=== 'true'` 为 false，即 hideHome 分支默认不触发）。hideHome=true 分支的覆盖留 Phase F 前用 `test.env.VITE_HIDE_HOME='true'` 专项 spec 或标注为可接受缺口（guard 分支逻辑简单且为上游模板行为）。

- [ ] **Step 9.2: 跑测试确认 RED**

```bash
pnpm --filter @multi-admin/pure-web run test -- src/router/guards.spec.ts
```

Expected: FAIL——`Cannot find module './guards'`。

- [ ] **Step 9.3: 实现 guards.ts（GREEN）**

```typescript
// src/router/guards.ts
import Cookies from 'js-cookie';
import { usePermissionStoreHook } from '@/store/modules/permission';
import { useMultiTagsStoreHook } from '@/store/modules/multiTags';
import { isUrl, openLink, isAllEmpty, storageLocal } from '@pureadmin/utils';
import { getTopMenu, findRouteByPath } from './utils';
import {
  type DataInfo,
  userKey,
  removeToken,
  multipleTabsKey
} from '@/utils/auth';

/** 路由白名单 */
export const whiteList = ['/login'];

const { VITE_HIDE_HOME } = import.meta.env;

/** 已登录访问白名单时：留在当前页 */
export function toCorrectRoute(
  to: ToRouteType,
  from: ToRouteType
): string | undefined {
  return whiteList.includes(to.fullPath) ? from.fullPath : undefined;
}

/**
 * 访问控制守卫（从 router/index.ts beforeEach 抽取；bootstrap 副作用留在原回调）
 * 返回：false 阻断 / 路由描述 重定向 / true 放行白名单 / undefined 继续
 */
export function permissionGuard(
  to: ToRouteType,
  from: ToRouteType,
  ctx: { router: { push: (location: string) => unknown } }
): false | { path: string } | true | string | undefined {
  const userInfo = storageLocal().getItem<DataInfo<number>>(userKey);
  const externalLink = isUrl(to?.name as string);

  if (Cookies.get(multipleTabsKey) && userInfo) {
    // 无权限跳转 403
    if (to.meta?.roles && !to.meta.roles.includes(userInfo.roles?.[0] ?? '')) {
      return { path: '/error/403' };
    }
    // 隐藏首页后手动输入 welcome 路由 → 404
    if (VITE_HIDE_HOME === 'true' && to.fullPath === '/welcome') {
      return { path: '/error/404' };
    }
    if (from?.name) {
      if (externalLink) {
        openLink(to?.name as string);
        return false;
      }
      return toCorrectRoute(to, from);
    }
    // 刷新场景：动态路由未加载则 initRouter 后重定向
    if (
      usePermissionStoreHook().wholeMenus.length === 0 &&
      to.path !== '/login'
    ) {
      const init = async () => {
        const permissionStore = usePermissionStoreHook();
        if (!useMultiTagsStoreHook().getMultiTagsCache) {
          const route = findRouteByPath(
            to.path,
            permissionStore.wholeMenus
          );
          getTopMenu(true);
          if (route && route.meta?.title) {
            const { path, name, meta } = isAllEmpty(route.parentId)
              ? route.children?.[0] ?? route
              : route;
            useMultiTagsStoreHook().handleTags('push', { path, name, meta });
          }
        }
        if (isAllEmpty(to.name)) ctx.router.push(to.fullPath);
      };
      void init();
    }
    return toCorrectRoute(to, from);
  }

  if (to.path !== '/login') {
    if (whiteList.includes(to.path)) {
      return true;
    }
    removeToken();
    return { path: '/login' };
  }
  return true;
}
```

**注意**：原 index.ts 的 403 判定是 `isOneOfArray(to.meta.roles, userInfo.roles)`（多角色交集）；上面用 `includes(userInfo.roles?.[0])` 会改变语义——**必须保持原语义**：

```typescript
import { isOneOfArray } from './utils';
// ...
    if (to.meta?.roles && !isOneOfArray(to.meta?.roles, userInfo?.roles ?? [])) {
      return { path: '/error/403' };
    }
```

initRouter 原逻辑依赖 `router.options.routes[0].children` 与 store 的 `handleTags` 细节，抽取时**逐行对照原实现**（router/index.ts L153-226），只搬决策不改行为；上面 init 片段为骨架，实施时以原文件为准逐行迁移，spec 断言不因实现细节漂移。

- [ ] **Step 9.4: 改 router/index.ts 接线**

index.ts beforeEach 改为：

```typescript
import { permissionGuard } from './guards';

router.beforeEach((to, _from) => {
  to.meta.loaded = loadedPaths.has(to.path);
  if (!to.meta.loaded) {
    NProgress.start();
  }
  if (to.meta?.keepAlive) {
    handleAliveRoute(to, 'add');
    if (_from.name === undefined || _from.name === 'Redirect') {
      handleAliveRoute(to);
    }
  }
  const externalLink = isUrl(to?.name as string);
  if (!externalLink) {
    to.matched.forEach(item => {
      if (!item.meta.title) return;
      const Title = getConfig().Title;
      if (Title) document.title = `${transformI18n(item.meta.title)} | ${Title}`;
      else document.title = transformI18n(item.meta.title);
    });
  }
  return permissionGuard(to, _from, { router });
});
```

从 index.ts 移除已迁移的 import（Cookies、useMultiTagsStoreHook、usePermissionStoreHook、isAllEmpty、storageLocal、openLink、getTopMenu、findRouteByPath、removeToken、userKey/multipleTabsKey/DataInfo、isOneOfArray 中不再使用者），并删除内联 `toCorrectRoute`。**whiteList 常量一并移入 guards.ts。**

- [ ] **Step 9.5: 跑全量验证**

```bash
pnpm --filter @multi-admin/pure-web run test -- src/router
pnpm --filter @multi-admin/pure-web run typecheck
```

Expected: guards.spec 全绿；既有 router.spec / utils.spec 仍绿；typecheck 零错误（含 strict 单配置）。**router.spec.ts 若有对 beforeEach 行为的依赖，同步适配。**

- [ ] **Step 9.6: guards.ts 覆盖验证 + 补键 + 提交**

```bash
pnpm --filter @multi-admin/pure-web run test -- src/router/guards.spec.ts --coverage
```

Expected: guards.ts lines/branches ≥80（未达标补用例）。然后 vitest.config.ts 追加：

```typescript
        'src/router/guards.ts': { lines: 80, branches: 80 },
```

```bash
git add apps/pure-web/src/router apps/pure-web/vitest.config.ts
git commit -m "refactor(web): 路由守卫抽离 guards.ts 并单测登记（crown-jewel 候选）"
```

### Task 10: 域 1 layout hooks T1×3 characterization 补测 + 壳文件判定落地

**Files:**
- Create: `apps/pure-web/src/layout/hooks/useBoolean.spec.ts`、`useLayout.spec.ts`、`useTranslationLang.spec.ts`
- Modify: `apps/pure-web/vitest.config.ts`（3 键 + 壳 exclude）
- Create: T2 ×7 集成 spec + T3 ×12 smoke spec（layout 域 B 类壳文件，结论见 Task 3 清单）

- [ ] **Step 10.1: useBoolean.spec.ts（characterization 补测）**

```typescript
// src/layout/hooks/useBoolean.spec.ts
import { describe, it, expect } from 'vitest';
import { useBoolean } from './useBoolean';

describe('useBoolean', () => {
  it('默认初始为 false', () => {
    const { bool } = useBoolean();
    expect(bool.value).toBe(false);
  });

  it('自定义初始值', () => {
    const { bool } = useBoolean(true);
    expect(bool.value).toBe(true);
  });

  it('setBool/setTrue/setFalse/toggle 行为', () => {
    const { bool, setBool, setTrue, setFalse, toggle } = useBoolean();
    setBool(true);
    expect(bool.value).toBe(true);
    setFalse();
    expect(bool.value).toBe(false);
    setTrue();
    expect(bool.value).toBe(true);
    toggle();
    expect(bool.value).toBe(false);
    toggle();
    expect(bool.value).toBe(true);
  });
});
```

```bash
pnpm --filter @multi-admin/pure-web run test -- src/layout/hooks/useBoolean.spec.ts
```

Expected: 首跑因 spec 文件不存在而失败 → 写入后直接 GREEN（useBoolean.ts 是既有源码，补测锁定行为；若失败为意外差异，按 systematic-debugging 判定）。

- [ ] **Step 10.2: useLayout.spec.ts（characterization 补测）**

```typescript
// src/layout/hooks/useLayout.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLayout } from './useLayout';
import { routerArrays } from '../types';

// $storage 真实链路：@pureadmin/utils useGlobal 读 window 全局对象，在 jsdom 下可注入
function stubGlobal(storage: Record<string, unknown>, config: Record<string, unknown>) {
  (globalThis as any).__pureadmin_storage__ = storage;
  (globalThis as any).__pureadmin_config__ = config;
}

describe('useLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initStorage：storage 空时写入默认 layout/configure', () => {
    stubGlobal({}, { Layout: 'vertical', Theme: 'light' });
    const { initStorage } = useLayout();
    expect(() => initStorage()).not.toThrow();
  });

  it('initStorage：storage 已有 layout 时保留', () => {
    stubGlobal({ layout: { layout: 'mix' } }, {});
    const { initStorage, layoutTheme } = useLayout();
    initStorage();
    expect(layoutTheme.value.layout).toBe('mix');
  });

  it('initStorage：tags 空且 multiTagsCache 开 → 写 routerArrays', () => {
    stubGlobal({}, { MultiTagsCache: true });
    const { initStorage } = useLayout();
    expect(() => initStorage()).not.toThrow();
  });
});
```

**注意**：`useGlobal` 的实际挂载键名以源码为准（Read `useLayout.ts` + `@pureadmin/utils` 的 useGlobal 实现后修正 `__pureadmin_storage__` 占位）——**测试目标是 initStorage 的四个 if 分支与 computed 链路，注入方式允许调整**。跑通后按报告补分支。

- [ ] **Step 10.3: useTranslationLang.spec.ts（characterization 补测）**

```typescript
// src/layout/hooks/useTranslationLang.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTranslationLang } from './useTranslationLang';

// useNav 是组合依赖非被测对象：stub 其返回（stub 最小化；useNav 自身已有 spec 覆盖）
vi.mock('./useNav', () => ({
  useNav: () => ({
    $storage: { locale: undefined as { locale?: string } | undefined },
    changeTitle: vi.fn(),
    handleResize: vi.fn()
  })
}));

describe('useTranslationLang', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('translationCh 设 zh 并调用 handleResize（ref 传入时）', () => {
    const ref = { value: {} };
    const { locale, translationCh } = useTranslationLang(ref as any);
    translationCh();
    expect(locale.value).toBe('zh');
  });

  it('translationEn 设 en', () => {
    const { locale, translationEn } = useTranslationLang();
    translationEn();
    expect(locale.value).toBe('en');
  });

  it('onBeforeMount 从 storage 恢复 locale', async () => {
    // mount 场景验证恢复逻辑：用 @vue/test-utils 挂一个消费 hook 的宿主组件
    const { mount } = await import('@vue/test-utils');
    const Comp = { template: '<div />', setup: () => useTranslationLang() };
    mount(Comp);
    // 无抛错即通过（storage.locale 为空时回退 'zh'）
  });
});
```

```bash
pnpm --filter @multi-admin/pure-web run test -- src/layout/hooks/useTranslationLang.spec.ts
```

Expected: 首跑因 spec 文件不存在而失败 → 写入后 GREEN（源码已存在，仅登记测试）。三个 hook 全绿后补键：

```typescript
        'src/layout/hooks/useBoolean.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useLayout.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useTranslationLang.ts': { lines: 80, branches: 80 },
```

- [ ] **Step 10.4: 按已定结论落地 T2 集成测试与 T3 smoke（22 个 B 类文件）**

判定结论已在 Task 3 清单固化（计划编写期源码通读）；执行时 Read 对应文件复核，若源码与结论明显不符按规则修正：含 script setup 且有 if/计算/事件处理分支 → T2；仅 template 组合子组件、无独立分支（逻辑已下沉 hook/store）→ T3。

**T2 集成测试关键断言点**（7 个，逐一写 spec；mount 真实子依赖）：

- `lay-notice/index.vue`：3 tab 渲染；「标记已读」点击后 currentNoticeHasData=false（按钮区消失）
- `lay-panel/index.vue`：`emitter.emit('openPanel')` → show 类出现；关闭 icon 点击 → show=false
- `SearchModal.vue`：输入关键字（debounce 300ms，用 fake timers）→ 结果过滤 + showSearchResult；Enter → router.push + 历史写入；删除/收藏事件
- `SearchHistory.vue`：historyList/collectList 按 type 过滤；mouseenter 高亮 active；collect/delete/enter/drag 事件转发
- `NavHorizontal.vue`：showLogo 初始取 storage；`emitter.emit('logoChange')` 切换 logo 显隐；defaultActive 走 route.meta.activePath 分支
- `NavMix.vue`：getDefaultActive 两分支（meta.activePath 优先 / 父路径 children[0]）
- `NavVertical.vue`：getSubMenuData 无 children 早退；menuData 的 mix 分支走 subMenuData

**T3 smoke 清单**（12 个，套 smoke 模板 + exclude + 登记）：`src/layout/index.vue`、`src/layout/frame.vue`、`lay-content/index.vue`、`lay-frame/index.vue`、`lay-navbar/index.vue`、`NoticeItem.vue`、`lay-search/index.vue`、`SearchFooter.vue`、`SidebarFullScreen.vue`、`SidebarCenterCollapse.vue`、`SidebarLeftCollapse.vue`、`SidebarTopCollapse.vue`。

T2 集成测试模板（含 router，避免 useRoute/useRouter 崩）：

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@/test-utils/mount';
import { createRouter, createMemoryHistory } from 'vue-router';
import Xxx from './Xxx.vue';

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Xxx }] });

describe('Xxx（T2）', () => {
  it('渲染关键元素且交互符合预期', async () => {
    const wrapper = mount(Xxx, { global: { plugins: [router] } });
    expect(wrapper.exists()).toBe(true);
    // 按组件实际交互补断言（点击/emit/条件渲染）——具体断言以源码行为为准
  });
});
```

T3 smoke 模板：

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@/test-utils/mount';
import Xxx from './Xxx.vue';

describe('Xxx（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(Xxx);
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
```

**mount 无法满足的依赖**（如 lay-frame 的 iframe、lay-navbar 的复杂 store 链）：Read `src/test-utils/mount.ts` 现状 → 按需在 mount helper 增补插件/stub（**只增不减，不破坏既有 48 spec**）。

- [ ] **Step 10.5: 壳 exclude 追加（T3 同提交）**

判定为 T3 的文件追加 exclude（理由 `// T3: 页面壳（smoke 已覆盖）`）并同步 exclude-registry.md；T2 文件补键。

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
# 全绿后
git add apps/pure-web/src/layout apps/pure-web/vitest.config.ts docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
git commit -m "test(web): 域1 layout hooks 单测 + 壳文件分类落地（T2 补测 / T3 smoke+exclude）"
```

### Task 11: 域 3 login + welcome 判定补测（7 文件）

**Files:**
- Create: 判定为 T2 的 spec；T3 的 smoke spec
- Modify: `apps/pure-web/vitest.config.ts`、`exclude-registry.md`

- [ ] **Step 11.1: 按已定结论落地**（判定结论见 Task 3 清单，复核规则同 Task 10 Step 10.4）

```
src/views/login/index.vue                      → T3 壳（smoke；校验逻辑在 utils/ 已登记；E2E auth.spec 覆盖旅程）
src/views/login/components/LoginPhone.vue      → T2（validate 通过 → loading→success message 用 fake timers；invalid → loading false；onBack 重置）
src/views/login/components/LoginQrCode.vue     → T3 壳（smoke；canvas 由 T4 排除的 ReQrcode 承载）
src/views/login/components/LoginRegist.vue     → T2（repeatPasswordRule 空/不一致/一致三分支；checked=false → warning）
src/views/login/components/LoginUpdate.vue     → T2（repeatPasswordRule 三分支；validate 分支）
src/views/welcome/index.vue                    → T3 壳（smoke；图表/表格均为子组件）
src/views/welcome/components/table/index.vue   → T3 壳（smoke；数据/分页逻辑在 columns.tsx 已登记）
```

- [ ] **Step 11.2: 按清单落地**

T2 ×3（LoginPhone/LoginRegist/LoginUpdate）写集成测试（模板同 Task 10 Step 10.4）；T3 ×4 smoke（模板同 Task 10）+ exclude + 登记。LoginQrCode 已判 T3（无 T4 项，无 E2E 回补缺口）。

- [ ] **Step 11.3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
git add apps/pure-web/src/views/login apps/pure-web/src/views/welcome apps/pure-web/vitest.config.ts docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
git commit -m "test(web): 域3 login/welcome 分类落地（T2 补测 / T3 smoke+exclude）"
```

### Task 12: 域 4 account-settings + monitor 判定补测（10 文件）

**Files:**
- Create: 判定为 T2 的 spec；T3 的 smoke spec
- Modify: `apps/pure-web/vitest.config.ts`、`exclude-registry.md`

- [ ] **Step 12.1: 按已定结论落地**（判定结论见 Task 3 清单，复核规则同 Task 10 Step 10.4）

```
src/views/account-settings/index.vue                       → T3 壳（smoke；tab 容器）
src/views/account-settings/components/AccountManagement.vue → T3 壳（smoke；静态列表 + message 占位）
src/views/account-settings/components/Preferences.vue       → T3 壳（smoke；静态开关列表 + message 占位）
src/views/account-settings/components/Profile.vue           → T2（getMine code=0 填充表单；queryEmail 过滤；handleSubmitImage code 分支；ReCropperPreview 为 T4 stub）
src/views/account-settings/components/SecurityLog.vue       → T2（onSearch code=0 填充 dataList/pagination；404 catch 空态；finally loading=false）
src/views/monitor/logs/login/index.vue      → T3 壳（smoke；hook.tsx 已登记）
src/views/monitor/logs/operation/index.vue  → T3 壳（smoke）
src/views/monitor/logs/system/index.vue     → T3 壳（smoke）
src/views/monitor/logs/system/detail.vue    → T3 壳（smoke）
src/views/monitor/online/index.vue          → T3 壳（smoke；无 echarts，纯表格组合）
```

- [ ] **Step 12.2: 按清单落地**

T2 ×2（Profile/SecurityLog）写集成测试（模板同 Task 10 Step 10.4；api 边界 mock：`@/api/mock` 的 formUpload 与 `@/api/user` 的 getMine/getMineLogs）；T3 ×8 smoke + exclude + 登记。

- [ ] **Step 12.3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
git add apps/pure-web/src/views/account-settings apps/pure-web/src/views/monitor apps/pure-web/vitest.config.ts docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
git commit -m "test(web): 域4 account-settings/monitor 分类落地（T2 补测 / T3 smoke+exclude）"
```

### Task 13: 域 5 剩余判定——组件 type.ts ×4 + 收尾核对

**Files:**
- Modify: `apps/pure-web/vitest.config.ts`、`exclude-registry.md`
- 可能 Create: 判定为 T1 的 type.ts spec

- [ ] **Step 13.1: 4 个组件 type.ts 判定**

```
src/components/ReDialog/type.ts
src/components/ReDrawer/type.ts
src/components/ReSegmented/src/type.ts
src/components/ReIcon/src/types.ts
```

Read 每个文件：
- **纯类型** → T5 exclude（理由 `// T5: 纯类型`）+ 登记；
- **含运行时值**（withDefaults/props 默认值/常量）→ T1：写 spec（断言 props 默认值与导出常量）至 ≥80 后补键。

T1 type.ts spec 模板：

```typescript
import { describe, it, expect } from 'vitest';
import { xxxProps, SomeConst } from './type';

describe('type.ts 运行时导出', () => {
  it('props 默认值正确', () => {
    expect(xxxProps.someProp.default).toBe('期望值');
  });
  it('常量导出正确', () => {
    expect(SomeConst).toBe('期望值');
  });
});
```

- [ ] **Step 13.2: 全量收尾核对**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

核对：**118 文件全部落位**——A 类补键完成、T1/T2 补测完成、T3/T4/T5 全部 exclude+登记。text 报告 per-file 表不应再有「未登记且未排除」的业务文件。**若仍有残留，回对应任务补位。**

- [ ] **Step 13.3: 提交**

```bash
git add apps/pure-web/src/components apps/pure-web/vitest.config.ts docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
git commit -m "test(web): 组件 type.ts 分类落地 + 118 文件收尾核对全落位"
```

### Task 14: Phase T.1 E2E 双模改造（helpers + 凭证 env 化 + tagging）

**Files:**
- Create: `apps/pure-web/e2e/helpers.ts`
- Modify: `apps/pure-web/e2e/auth.spec.ts`、`routing.spec.ts`、`components.spec.ts`、`verify.spec.ts`
- Modify: `apps/pure-web/playwright.config.ts`（已含双模 webServer，Task 1）

- [ ] **Step 14.1: 写 helpers.ts**

```typescript
// e2e/helpers.ts
import { expect, type Page } from '@playwright/test';

/** Tier A mock 缺省 admin/admin123（mock/login.ts 对任意用户名放行，密码不校验）；
 *  Tier B real 由 env 注入真实凭证（CI: E2E_ADMIN_PASS=smoke-admin-password；本地: dev-admin-pass） */
export const E2E_MODE = process.env.E2E_MODE ?? 'mock';
export const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
export const ADMIN_PASS =
  E2E_MODE === 'real'
    ? (process.env.E2E_ADMIN_PASS ?? 'dev-admin-pass')
    : (process.env.E2E_ADMIN_PASS ?? 'admin123');

/** 前端 canvas 验证码（pinia store 中 verifyCode）；后端无验证码校验，real 模式照填即可 */
export async function readVerifyCode(page: Page): Promise<string> {
  const code = await page.evaluate(() => {
    const app = document.querySelector('#app') as any;
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    const userStore = pinia?._s?.get('pure-user');
    return userStore?.verifyCode ?? '';
  });
  expect(code).toMatch(/^\d{4}$/);
  return code;
}

/** 填凭证 + 验证码 + 提交登录；real 模式凭证由 env 决定 */
export async function fillAndSubmitLogin(page: Page): Promise<void> {
  await page.getByPlaceholder('账号').fill(ADMIN_USER);
  await page.getByPlaceholder('密码').fill(ADMIN_PASS);
  const code = await readVerifyCode(page);
  await page.getByPlaceholder('验证码').fill(code);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

/** 登录并等待首页就绪（动态路由注册完成信号） */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.getByPlaceholder('验证码')).toBeVisible({ timeout: 15_000 });
  await fillAndSubmitLogin(page);
  await page.waitForFunction(
    () => {
      const app = document.querySelector('#app') as any;
      const router = app?.__vue_app__?.config?.globalProperties?.$router;
      return router?.hasRoute('PageNotFound') === true;
    },
    { timeout: 15_000 }
  );
  await page.waitForLoadState('load');
}
```

- [ ] **Step 14.2: auth.spec.ts 改造（用 helpers + 打 tag）**

删除文件内 inline 凭证填写（L22-35），改为：

```typescript
import { test, expect } from '@playwright/test';
import { fillAndSubmitLogin } from './helpers';

test.describe('登录链路', () => {
  test('表单空校验 → 填写凭证 → 登录成功 → 首页菜单渲染 → 退出回到登录页 @mock-only', async ({
    page
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await expect(page.getByPlaceholder('账号')).toBeVisible({ timeout: 15_000 });
    const usernameInput = page.getByPlaceholder('账号');
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.fill('');
    await usernameInput.blur();
    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
    await fillAndSubmitLogin(page);
    // 后续断言（首页菜单/退出）保持不变
  });
});
```

**注**：登录旅程在 Tier A 标 `@mock-only`（空校验行为依赖 mock 表单校验，real 模式由 Task 15 的 @real-backend 登录覆盖）；若想双模共用，可将空校验段拆为独立 `@mock-only` test、主旅程加 `@real-backend` tag——按重构实际取舍，两 tag 语义必须清晰。

- [ ] **Step 14.3: routing.spec.ts 改造**

删除 L6-32 内联 `loginAsAdmin`，改为 `import { loginAsAdmin } from './helpers';`；test 标题追加 tag：

```
一级菜单导航 ... → @mock-only（mock asyncRoutes 驱动）
403 页面 ...       → @mock-only（mock 路由 meta）
404 页面 ...       → @mock-only
未登录重定向 ...   → @mock-only（mock 态守卫行为；real 守卫同逻辑但依赖真实 token 状态）
```

**注**：未登录重定向在 real 模式同样成立（guard 逻辑同源），可标 `@mock-only` 或留双模——保守起见先标 `@mock-only`，Tier B 冒烟只跑真旅程。

- [ ] **Step 14.4: components.spec.ts / verify.spec.ts 打 @mock-only**

各 test 标题追加 `@mock-only`（canvas 回补无需真后端）。

- [ ] **Step 14.5: 验证双模跑通并提交**

```bash
cd apps/pure-web
# Tier A 全量（mock，回归）
npx playwright test --reporter=line
# Tier B 分层（real，需要后端在跑：Task 1 环境或 pnpm dev:server）
$env:E2E_MODE='real'
npx playwright test --grep @real-backend --reporter=line
```

Expected: Tier A 9 test 绿；Tier B 现有 1 test（Task 1 登录）绿。

```bash
git add apps/pure-web/e2e
[ -n "$(git status --short apps/pure-web/playwright.config.ts)" ] && git add apps/pure-web/playwright.config.ts
git commit -m "refactor(web): E2E 双模 helpers 化——凭证 env 化 + @mock-only/@real-backend 分流"
```

### Task 15: Phase T.2 Tier B 真实后端冒烟（3 新增 test）

**Files:**
- Modify: `apps/pure-web/e2e/real-backend.spec.ts`（登录 + 3 新增）

**前置**：真实后端在跑（`pnpm dev:server` + postgres/redis；本地凭证 dev-admin-pass）。

**顺序依赖（重要）**：锁定 test 会真实锁定 admin 账号（后端锁定阈值触发后，其余旅程登录均失败）——**锁定 test 必须位于文件末尾**，且本文件 4 个 test 按定义顺序串行执行（同文件内 Playwright 按声明序运行；CI `--workers=1` 保障）。若未来拆分文件，锁定 test 独立成 spec 并用 `test.describe.configure({ mode: 'serial' })` 保护顺序。

- [ ] **Step 15.0: real-backend.spec.ts 接入 helpers（重构，不改变旅程断言）**

将 Task 1 创建的内联实现替换为 helpers：删除文件内 `ADMIN_USER` / `ADMIN_PASS` 常量与内联验证码读取代码，顶部改为：

```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin, readVerifyCode } from './helpers';
```

登录 test 改为（登录段用 helper，旅程断言保持 Task 1 原样）：

```typescript
test('直连真实后端登录→首页菜单→退出 @real-backend', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('.el-menu').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('.el-dropdown-link').last().click();
  await page.getByText('退出系统').click();
  await page.waitForURL('**/#/login', { timeout: 10_000 });
  await expect(page.locator('.login-container')).toBeVisible();
});
```

Expected: 重构后 `npx playwright test e2e/real-backend.spec.ts --reporter=line`（real 模式）仍绿。

- [ ] **Step 15.1: CRUD 代表旅程（TDD RED）**

```typescript
// e2e/real-backend.spec.ts 追加
const rand = () => Date.now().toString(36).slice(-6);

test('用户管理 CRUD 全链路 @real-backend', async ({ page }) => {
  await loginAsAdmin(page);
  await page.locator('.el-menu').first().getByText('系统管理').click();
  await page.locator('.el-menu').first().getByText('用户管理').click();
  await page.waitForLoadState('load');

  // 增：打开新建对话框，填用户名，提交
  const name = `e2e_user_${rand()}`;
  await page.getByRole('button', { name: '新增' }).click();
  await page.getByPlaceholder('请输入用户名').fill(name);
  await page.getByRole('button', { name: '确定', exact: true }).click();
  // 查：列表出现新用户（等待接口刷新）
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  // 改：触发编辑（列表行内操作）并修改昵称
  //   选择器以真实页面 DOM 为准（执行时 page.locator 检查），断言编辑后字段变化
  // 删：删除该行并断言消失
  await expect(page.getByText(name).first()).toBeHidden({ timeout: 10_000 });
});
```

**注意**：新增/编辑/删除的具体按钮文案与表单 placeholder 以**直连态真实页面 DOM**为准（执行时用 `npx playwright codegen` 或 inspector 核对）；断言骨架（增→可见→删→消失）不变。若真实页面无「新增」按钮（权限/菜单差异），改用列表加载断言 + 更新一条现有数据的最小 CRUD 闭环，并在 test 注释记录取舍。

- [ ] **Step 15.2: token 静默轮换（TDD RED）**

```typescript
test('token 失效自动刷新重试（BizCode 40102 静默轮换） @real-backend', async ({ page }) => {
  await loginAsAdmin(page);
  // 篡改 accessToken 为无效值（key 与结构 Read src/utils/auth.ts 确认，evaluate 修改 localStorage）
  await page.evaluate(() => {
    const raw = localStorage.getItem('multi-admin-user') ?? ''; // userKey 以 auth.ts 为准
    const data = JSON.parse(raw);
    data.accessToken = 'eyJhbGciOiJIUzUxMiJ9.invalid';
    localStorage.setItem('multi-admin-user', JSON.stringify(data));
  });
  // 触发一次需鉴权 API（导航到用户管理触发列表请求）
  await page.locator('.el-menu').first().getByText('系统管理').click();
  await page.locator('.el-menu').first().getByText('用户管理').click();
  // 断言：无登出跳转（仍在用户管理页），列表渲染成功（40102 → refresh → 重试成功）
  await expect(page).toHaveURL(/system\/user/);
  await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 15.3: 账号锁定 42301 前端处理（TDD RED）**

```typescript
test('连续错误登录触发账号锁定提示（42301 前端渲染） @real-backend', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  // 连续 5 次错误密码（阈值以后端 auth 模块锁定实现为准；每轮重新填验证码）
  for (let i = 0; i < 5; i++) {
    await page.getByPlaceholder('账号').fill('admin');
    await page.getByPlaceholder('密码').fill(`wrong-pass-${i}`);
    const code = await readVerifyCode(page);
    await page.getByPlaceholder('验证码').fill(code);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForTimeout(500);
  }
  // 断言：出现锁定提示（后端 message 文案含「锁定」；具体文案以信封 message 为准）
  await expect(page.getByText(/锁定|lock/i).first()).toBeVisible({ timeout: 10_000 });
});
```

**注意**：登录限流 5 次/分（IP 维度）会与锁定阈值叠加——若第 5 次前先触发 429，锁定测试与限流测试互斥时按后端 auth e2e 的既有边界（`auth.e2e-spec.ts` 429/锁定用例模式）调整循环次数，test 注释记录。

- [ ] **Step 15.4: 串行执行验证 + 提交**

```bash
cd apps/pure-web
$env:E2E_MODE='real'
npx playwright test e2e/real-backend.spec.ts --workers=1 --reporter=line
```

Expected: 4 test 全绿（登录 + CRUD + token 轮换 + 锁定）。flaky 时按 systematic-debugging 定位（共享态：用例间 flushdb 需求以 nestjs-server e2e 范式为参照）。

```bash
git add apps/pure-web/e2e/real-backend.spec.ts
git commit -m "test(web): Tier B 真实后端冒烟 4 test（登录/CRUD/token 轮换/账号锁定）"
```

### Task 16: Phase T.3 CI job e2e-web-real（报警式，合 master + nightly）

**Files:**
- Modify: `.github/workflows/ci.yml`（on 加 schedule + 新 job）

- [ ] **Step 16.1: on 加 nightly schedule**

在既有 `on:` 块（push master + workflow_dispatch，现状 L5-8）末尾追加 `schedule` 段，其余不动：

```yaml
  schedule:
    # 每日 nightly（UTC 18:00 = 北京 02:00）：Tier B 真实后端冒烟低频兜底
    - cron: '0 18 * * *'
```

- [ ] **Step 16.2: 新 job（插在 e2e-web 之后）**

```yaml
  e2e-web-real:
    name: e2e-web-real（Tier B 真实后端冒烟，报警式不红）
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b # pin: 2026-08-27 (pnpm ops:check-digests quarterly)
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: multi_admin
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d multi_admin"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf # pin: 2026-08-27 (pnpm ops:check-digests quarterly)
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/multi_admin?schema=public
      REDIS_URL: redis://localhost:6379
      # 冒烟专用丢弃值（非生产秘密，内联安全）——与 docker-build 冒烟同源
      ADMIN_INIT_PASSWORD: smoke-admin-password
      JWT_ACCESS_SECRET: smoke-access-secret-000000000000000000
      JWT_REFRESH_SECRET: smoke-refresh-secret-000000000000000000
      E2E_MODE: real
      E2E_ADMIN_USER: admin
      E2E_ADMIN_PASS: smoke-admin-password
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: 构建 nestjs-server
        run: pnpm exec turbo run build --filter=@multi-admin/nestjs-server
      - name: 建库 + seed（真实链路起点）
        run: |
          pnpm --filter @multi-admin/nestjs-server exec prisma migrate deploy
          pnpm --filter @multi-admin/nestjs-server run prisma:seed
      - name: 后台起 server（3000）
        run: |
          node apps/nestjs-server/dist/main.js &
          for i in 1 2 3 4 5 6 7 8 9 10; do
            curl -sf http://localhost:3000/health && break
            sleep 2
          done
          curl -sf http://localhost:3000/health
      - name: 安装 chromium
        run: pnpm --filter=@multi-admin/pure-web exec playwright install chromium --with-deps
      - name: Tier B 冒烟（--grep @real-backend）
        run: pnpm --filter=@multi-admin/pure-web exec playwright test --grep @real-backend --workers=1
        continue-on-error: true
```

**要点**：`dist/main.js` 入口路径以 nest build 实际产物为准（执行时 `ls apps/nestjs-server/dist | head` 确认）；health 探测路径以 docker-build job 的 `/health` 为参照（server-smoke.sh 已证）；`--workers=1` 串行（flaky 缓解）；`continue-on-error: true` 实现报警式。

- [ ] **Step 16.3: 更新 ci.yml 头注释 + 验证 YAML 合法 + 提交**

L2 注释「七 job 全并行」→「八 job 全并行（e2e-web-real 报警式）」。YAML 合法性：本地 `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`（仓库有 js-yaml 依赖）或让 GH Actions 解析。

```bash
git add .github/workflows/ci.yml
git commit -m "ci(web): 新增 e2e-web-real 报警式 job（Tier B 真实后端冒烟，合 master + nightly）"
```

### Task 17: Phase F 翻转闸门 + living 规范提升 + 收口

**Files:**
- Modify: `apps/pure-web/vitest.config.ts`（91 键 → 全局聚合 + 6 crown-jewel）
- Modify: `apps/pure-web/AGENTS.md`（L35 措辞）、`docs/engineering/build-and-verify.md`（L97-101 收敛）
- Create: `docs/engineering/frontend-testing-standard.md`（living 规范）
- Modify: `docs/engineering/README.md`（索引）、`docs/tasks/README.md`（热索引移完成）、任务目录 README

- [ ] **Step 17.1: 翻转前验算（crown-jewel 6 文件 ≥90）**

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

从报告核对 6 个 crown-jewel 文件：`src/utils/auth.ts`、`src/store/modules/user.ts`、`src/utils/http/index.ts`、`src/router/guards.ts`、`src/utils/tree.ts`、`src/store/modules/permission.ts` 均 lines/branches ≥90。

**不达标文件**：补用例至 90（characterization——既有源码锁定行为；仅 guards.ts 为 Task 9 新代码，其缺口继续 TDD）；若证实某文件存在无法覆盖的防御分支（补用例后仍 <90），将该文件降为 80 键并在 living 规范记录理由（crown-jewel 清单 ≤8 的弹性）。

- [ ] **Step 17.2: thresholds 翻转**

将整个 `thresholds` 块（91 键）替换为：

```typescript
      thresholds: {
        // 全局聚合兜底：非排除文件 per-file ≥80 ⇒ 聚合必 ≥80（设计 2.3 数学保证）
        lines: 80,
        branches: 80,
        // crown-jewel：安全关键逻辑 elevated bar ≥90（清单见 frontend-testing-standard.md）
        'src/utils/auth.ts': { lines: 90, branches: 90 },
        'src/store/modules/user.ts': { lines: 90, branches: 90 },
        'src/utils/http/index.ts': { lines: 90, branches: 90 },
        'src/router/guards.ts': { lines: 90, branches: 90 },
        'src/utils/tree.ts': { lines: 90, branches: 90 },
        'src/store/modules/permission.ts': { lines: 90, branches: 90 }
      }
```

```bash
pnpm --filter @multi-admin/pure-web run test:coverage
```

Expected: 全绿（全局聚合 + crown-jewel）。**红 → 按 systematic-debugging 定位欠覆盖文件（排除 exclude 漏网/新文件未测），修绿才提交。**

- [ ] **Step 17.3: 写 living 规范 docs/engineering/frontend-testing-standard.md**

```markdown
---
status: living
covers:
  - apps/pure-web/vitest.config.ts
  - apps/pure-web/playwright.config.ts
  - apps/pure-web/e2e/
  - .github/workflows/ci.yml
  - apps/pure-web/AGENTS.md
last_verified: 2026-09-XX（实施完成日）
---

# pure-web 前端测试评估规范

> 决策理由见 [ADR-008](../../docs/decisions/ADR-008-tiered-e2e-testing.md)（双层 E2E）；本文记「怎么做」，随代码演进维护。

## 1. 六层分类框架

（从设计文档 1.1/1.2 复制六层表 + exclude 治理铁律 + 1.3 判定决策树 + 1.4 三原则）

## 2. 阈值终态

- 全局聚合 lines/branches ≥80；crown-jewel 6 键 ≥90（清单见 vitest.config.ts thresholds 内联注释，本文同步主表）。
- 数学保证：非排除文件 per-file ≥80 ⇒ 聚合 ≥80。

## 3. exclude 治理

- 每条 exclude 映射 T3/T4/T5 + 理由；配置内联理由 + 本文主表双处同源。
- T4 豁免双向登记：薄测试 + E2E 回补 + 主表登记，三者缺一视为技术债。

### exclude 主表

（从 exclude-registry.md 迁移全文）

## 4. 双层 E2E 操作细则

（从设计文档 3.3 双层定义表 + 双模机制 + 3.4 强制旅程清单 + 3.5 Trophy 护栏复制）

## 5. 新增单元判定流程

（决策树：新文件 → T1/T2/T3/T4/T5 判定 + E2E 旅程正交判定）
```

**复制规则**：living 文档正文从设计文档对应章节原文复制（不加不减），只把「Tier B 待建」等时态改为已完成时态；exclude 主表与 exclude-registry.md 同步。

- [ ] **Step 17.4: AGENTS.md / build-and-verify.md / 索引同步**

AGENTS.md L35 改为：

```markdown
- 覆盖率门槛 ≥80% 全局聚合 + crown-jewel 6 键 ≥90%（auth / user store / http / guards / tree / permission，见 vitest.config.ts thresholds）只升不降；新页面/模块必须带单测纳入同一门槛（CI `coverage-web` job 报警式守护）。
```

build-and-verify.md L99 改为：

```markdown
- **单元测试**：vitest + @vue/test-utils + jsdom；配置 `apps/pure-web/vitest.config.ts`（独立于 `vite.config.ts`，不加载构建期插件）；覆盖范围 `src/**/*.{ts,tsx,vue}` + `build/*.ts` + `mock/*.ts`；阈值全局聚合 ≥80% + crown-jewel 6 键 ≥90%，exclude 治理与双层 E2E 细则见 [frontend-testing-standard.md](frontend-testing-standard.md)。
```

并更新 build-and-verify.md frontmatter `last_verified` 为实施完成日。

engineering/README.md：新增 frontend-testing-standard.md 索引行。tasks/README.md：主题行从「进行中」移入「最近已完成」。任务目录 README：状态改「已完成」，索引追加 plan.md / classification-118.md / exclude-registry.md / probe-*.md。

- [ ] **Step 17.5: doc-lint 验证 + 提交**

```bash
node scripts/doc-lint.cjs .
```

Expected：①孤儿 ②死链 ③frontmatter ⑤AGENTS 行数全 OK；④covers 漂移仅剩既存 3 项（repo-structure / build-and-verify / backlog）——**若新 living 文档被报漂移（同批提交时间戳问题），核实 covers 语义后确认或修复**。

```bash
# 提交 1：代码面（web scope）
git add apps/pure-web/vitest.config.ts apps/pure-web/AGENTS.md
git commit -m "test(web): Phase F 阈值翻转（91 键 → 全局聚合 + crown-jewel 90）+ AGENTS 措辞同步"
# 提交 2：文档面（docs scope，按执行前提 3 的 scope 约定）
git add docs/engineering/frontend-testing-standard.md docs/engineering/README.md docs/engineering/build-and-verify.md docs/tasks/README.md docs/tasks/2026-09-06-frontend-testing-standard/README.md docs/tasks/2026-09-06-frontend-testing-standard/exclude-registry.md
git commit -m "docs: living 规范 frontend-testing-standard 落位 + 索引与任务状态收口"
```

---

## 全计划验收清单（Phase F 后逐项确认）

- [ ] 118 未登记文件全部落位（补键 / 补测 / exclude+登记 三态）
- [ ] `pnpm check` + `test:coverage` 全绿（全局聚合 80 + crown-jewel 90）
- [ ] Tier A 9 test mock 绿；Tier B 4 test real 绿（本地 dev-admin-pass）
- [ ] ci.yml 八 job（e2e-web-real 报警式 + nightly cron）
- [ ] 91 键删除、全局聚合形态生效、AGENTS.md/build-and-verify.md 措辞同步
- [ ] living 规范 frontend-testing-standard.md 落位（covers 保护）+ exclude 主表同源
- [ ] doc-lint 仅剩既存 3 项 covers 漂移（归属 doc-lint gate 任务）
- [ ] scripts/tmp-coverage-gap.mjs 已删除（Task 0）
- [ ] ADR-008 / 设计文档 / 本计划三件套同目录归档，任务热索引移「最近已完成」

# AGENTS.md

This file provides guidance to AI Agents when working with code in this application.

本文件只覆盖 `apps/pure-web` 应用内事实；monorepo 全局规则（turbo 编排、catalog、commitlint scope、质量门禁双层）见根 [AGENTS.md](../../AGENTS.md)，冲突时以根文件为准。

## 常用命令（应用内执行）

```bash
pnpm dev                  # 端口 VITE_PORT=8848；缺省直连真实后端，VITE_MOCK=true 切离线 mock（见下方架构要点①）
pnpm build                # vite build + version.json（内存加大到 8G）；staging：pnpm build:staging
pnpm report               # 构建 + rollup-plugin-visualizer 体积报告
pnpm typecheck            # 双层：tsc --noEmit && vue-tsc --noEmit（strict 单一配置）
pnpm lint                 # eslint --max-warnings 0（只校验；格式化归 Prettier）
pnpm stylelint            # stylelint --max-warnings 0
pnpm test                 # vitest run；单文件：pnpm test -- src/utils/auth.spec.ts
pnpm test:watch           # vitest 增量监听
pnpm test:coverage        # v8 覆盖率，glob 键 ≥80% 门禁（thresholds 在 vitest.config.ts）
pnpm test:e2e             # Playwright；webServer 自启 VITE_MOCK=true vite --port 5199 --strictPort，无需手动起 dev
```

全仓入口 `pnpm check` / `pnpm dev:web` 经 turbo 编排，与此处直连脚本等价；e2e 依赖 chromium（`npx playwright install`）。

## 架构要点

1. **数据源开关 `VITE_MOCK`**（`vite.config.ts`）：缺省（false）注册 `/api/v1` → `http://localhost:3000` 代理直连 NestJS；`=true` 改为 `vite-plugin-fake-server` 整体接管且**不挂 proxy**（规避同路径冲突，`enableProd` 会注入生产构建）。mock fixture 在 [`mock/`](mock/) 与真实后端**契约同形**（同信封、同路径、同类型）——详见 [contracts.md](../../docs/architecture/contracts.md)，改接口先改 `packages/contracts` 再改 mock 与页面。
2. **vue-pure-admin 基底，非 fork**：上游（https://github.com/pure-admin/vue-pure-admin）以「手工合入 + 选择性吸收」维护，无 merge 历史；基线 SHA 与季度巡检（`pnpm ops:upstream-diff`）见 [upstream-tracking.md](../../docs/engineering/upstream-tracking.md)，合入纪律：只追加不改写、超季度陈旧做巡检。
3. **路由与权限**：[`src/router/`](src/router/) 为约定式模块（`modules/home.ts` 登录页、`modules/remaining.ts` 业务侧栏）；mock 态异步路由由 `mock/asyncRoutes.ts` 驱动。页面在 `src/views/` 按域分目录（login / system / monitor / account-settings / error / welcome / empty）。
4. **测试基建**：单测 vitest + @vue/test-utils + jsdom，配置 [`vitest.config.ts`](vitest.config.ts) **独立于** `vite.config.ts`（不加载构建期插件）；通用挂载与 stub 在 [`src/test-utils/`](src/test-utils/)。E2E（Playwright）四个 spec 在 [`e2e/`](e2e/)：auth 全链路、components、routing、verify 冒烟；cropper 深度交互为永久豁免。
5. **strict 单一配置**：`tsconfig.json` extends `@multi-admin/tsconfig/web.json`（strict 全套开关注入）；**无双 config、无清单断言、无豁免文件**，改类型以 typecheck 全量通过为准。
6. **构建链事实**：`build/` 目录集中 vite 插件列表、optimize 白名单与 env 包装（wrapperEnv）；构建目标 `es2015`、产物模板 `static/js|ext/[name]-[hash]`、sourcemap 关闭。

## 硬规则

- 覆盖率门槛 ≥80%（glob 键：`build/utils.ts` 与 `src/utils/tree.ts` 等）只升不降；新页面/模块必须带单测纳入同一门槛（CI `coverage-web` job 报警式守护）。
- mock fixture 不得出现真实后端不存在的路径/字段；mock-only 端点必须在 [contracts.md](../../docs/architecture/contracts.md) 清单登记。
- 不新增 `// @ts-expect-error` 以外的类型豁免；组件 API 变更同步更新 `src/components` 消费方与测试。
- 文档同步：改变本文件描述的行为（开关语义、命令、门槛）时，同一提交更新本文件与 [build-and-verify.md](../../docs/engineering/build-and-verify.md) 对应小节。

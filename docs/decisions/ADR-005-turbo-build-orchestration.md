---
status: accepted
date: 2026-08-23
---

# ADR-005 构建编排选型：采纳 Turborepo 任务图

## 背景

pre hook 编排模式在 P5 后出现结构性失效（设计文档 §2 证据）：

1. **7 处断链/缺口**：根 `-r` 入口无 contracts 前置；pure-web `build` 无前置；nestjs-server `build` 无 contracts；nestjs-server `dev` 无任何前置（`src/generated` 不入库，干净仓库断链）；electron-desktop `prebuild` 仅 pure-web 无 contracts（backlog 已登记）；两个 Dockerfile 容器内单包入口同样断链。
2. **组合爆炸**：`--filter` 单包入口不携带上游；跨任务依赖（typecheck/test → 上游 build 产物）无法由 pnpm 推导；只能按"消费方 × 入口变体"手写钩子。
3. **变体陷阱事故**：`prebuild` 不匹配 `build:dir`（pnpm 按精确脚本名匹配），导致目录打包模式绕过钩子、产物不完整。
4. **门禁语义缺陷**：四端 lint 脚本带 `--fix` 静默改写工作区；test 阶段 `--if-present` 静默跳过无覆盖可见性。

## 决策

采纳 `turbo.json` 任务图 + 四条总原则：

1. **原子自洽管包内前置**：包内工具生成物（如 `prisma generate`）嵌入该包脚本原子，保证任何环境（含 Docker 容器）裸跑脚本自洽。
2. **图管跨包顺序**：跨 workspace 依赖一律由 `turbo.json` 的 `dependsOn: ["^build"]` 从 workspace 依赖声明推导，脚本内禁止再出现 `pnpm --filter ... run build` 式编排。
3. **入口纪律**：所有编排入口走 `turbo run <task> [--filter=X]`（根脚本已封装）；裸 `pnpm --filter X run <script>` 为非入口专家操作，不保证链路。
4. **容器同构兜底**：Docker 内用 `pnpm --filter X... run build` 复用同一依赖图拓扑，与本地编排顺序一致。

全量移除 pre 钩子；根入口统一切换为 `turbo run`；变体（`build:dir` / `build:staging` / `build:mp-weixin`）在 `turbo.json` 显式声明。

## 被否决的替代方案

| 方案 | 否决理由 |
|---|---|
| 补强 pre hook | 组合爆炸本质未解；变体陷阱会复发；维护面随消费方×入口×变体三维膨胀 |
| pnpm 原生 `--filter X...` 拓扑（纯用） | 仅解决构建序，不覆盖 typecheck/test/dev 跨任务依赖；门禁编排仍需手工 |
| Nx | 功能过重（affected graph、module boundary lint）；引入成本高，仓库规模不匹配 |

## 双链模式正当性

本地 turbo 任务图 + 容器 pnpm `--filter X...` 原生拓扑，两条链的拓扑均从同一份 `package.json` 依赖声明自动推导、执行同一批脚本，顺序不会分叉。接 CI 后自然收敛为单链。

## 与 ADR-003 的关系

ADR-003 正文不修改（ADR 是不可变历史快照）。其中：

- **工具链精确 pin 决策**：继续有效，不受本决策影响。
- **"构建编排放在桌面端 `prebuild` 钩子"条款**：由本决策取代（改为 turbo 任务图编排）。
- 不在 ADR-003 文件上标注 `superseded`，因为仅部分条款被取代、pin 决策仍有效。

## 影响

- 全仓 pre 钩子（`prebuild` / `prebuild:dir` / `pretypecheck` / `pretest`）全量移除。
- 根脚本（`build` / `build:desktop` / `check` / `lint` / `typecheck` 等）统一切至 `turbo run`。
- Docker 镜像构建链改为 `pnpm --filter X...` 原生拓扑（同源依赖声明）。
- 新增构建变体必须同步入 `turbo.json`，否则不保证链路。
- 治理 backlog 两项关闭：electron-desktop prebuild 构建链、contracts 缺 lint/format 脚本。

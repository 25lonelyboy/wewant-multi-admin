---
status: accepted
date: 2026-08-25
---

# ADR-006 GitHub CI：入库后异步安全网

## 背景

仓库质量门禁原只有本地两层（`pnpm check` + husky 钩子，见 `docs/engineering/build-and-verify.md`）。单人工作流为直推 master / branch+worktree 本地合并，不走 GitHub PR，导致：

1. 「直接修改后直推」场景可完全绕过本地钩子（`--no-verify` 或遗忘），无服务端兜底。
2. Windows 本地与 Linux 生产镜像链的环境差异（换行符、原生依赖、Dockerfile 腐化）无持续验证手段。
3. 两个 Dockerfile 的构建链正确性只在本地偶发验证，腐化静默发生。

## 决策

接入 GitHub Actions CI，定位为**入库后异步安全网**（报警式，不拦截）：

1. **触发**：仅 `push: branches: [master]` + `workflow_dispatch`；无 `pull_request` 触发、不设分支保护（对直推无效且明确不要卡点）、不设 concurrency 组（每次 push 都应被验证，取消旧跑制造验证空洞）、不用 paths filter（public 免费、逻辑简单、避免未来引入分支保护时的跳过死锁）。
2. **Job 拓扑**：四 job 全并行、无 `needs` 依赖（public 仓库分钟数无限，反馈延迟是唯一成本）：
   - `gate`：`pnpm install --frozen-lockfile` + `pnpm check`（本地/服务端口径结构性一致）；
   - `docker-build`：buildx 构建两镜像，**不 push 任何 registry**（CD 不发布），web 镜像加启动冒烟；
   - `coverage`：GH Actions services（postgres:15 + redis:7）+ `test:coverage`，≥80% 四指标为报警式硬门槛；
   - `audit`：`pnpm audit --audit-level=high`，免 install，`continue-on-error` 报警式。
3. **全局 `HUSKY: '0'`**：声明式跳过钩子安装，不依赖 husky 在 CI 下的行为假设。
4. **audit 两段式**：v1 报警（上游不可行动漏洞不造成红疲劳），噪音基线复盘后再决定是否收紧为失败级。
5. **失败感知配套**：根 README CI badge + watch 邮件 + 纪律条款「CI 红 → 下一项工作先修 CI」（写入 build-and-verify.md）。

## 被否决的替代方案

| 方案                              | 否决理由                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| 合并前门禁（PR 触发 + 分支保护）  | 与直推/本地合并工作流不匹配；分支保护对直推无效                                              |
| gate 先行、docker 串行 `needs`    | public 免费场景下串行只增加反馈延迟；配额紧张时再议（可逆）                                  |
| runner 内 `docker compose up` 跑 e2e | services 是一等公民（健康检查/端口映射），与 `test/setup-env.ts` 默认值零改动对齐            |
| CI 内重新拼装 lint/test 命令      | 与本地 `pnpm check` 入口分叉，产生口径漂移面                                                 |
| audit 直接失败级                  | 上游未修复漏洞导致不可行动的红，击穿「红了必看」纪律                                         |

## 影响

- 新增 `.github/workflows/ci.yml`；工程代码零改动（check.mjs / turbo.json / Dockerfile / lockfile 原样复用）。
- `docs/engineering/build-and-verify.md` 门禁章节改写为双层（本地实时 + CI 异步兜底）+ 纪律条款。
- 治理 backlog 两项关闭：「CI/CD 落地」「依赖漏洞扫描」。
- 未来演进留口：推镜像发布仅需在 docker-build 加 push 步骤 + GHCR `GITHUB_TOKEN`；引入协作时门禁现成可升级为合并前拦截。

---
status: approved
last_verified: 2026-08-24
produced_by: evolution-planner + brainstorming skill
---

# GitHub CI 迁移路线图（异步安全网定位，CD 不发布）

切片按依赖排序；每片含验收信号。决策点已全部拍板（见「已拍板决策」），本路线图为 approved 状态。

## 切片序列

### S0 · 前置验证（本地，不改代码）
- 动作：干净工作区执行 `pnpm check` 全绿；`docker build -f apps/pure-web/Dockerfile .` 与 `docker build -f apps/nestjs-server/Dockerfile .` 冒烟通过。
- 验收信号：两条命令本地可复现成功。
- 目的：把「本地都过不了」的问题挡在 CI 之外，避免把调试成本花在 runner 上。

### S1-pre · ADR-006 先行（仓库惯例：先设计后实施）
- 动作：新增 `docs/decisions/ADR-006-github-ci.md`，记录：异步安全网定位、触发策略（push master + dispatch）、不设分支保护与 concurrency 的理由、不用 paths filter 的理由、四 job 并行与「CD 不发布」口径、audit 两段式（报警→收紧）策略。
- 验收信号：ADR 先于任何实施变更入库。

### S1 · CI v1：gate + docker-build + audit（三 job 并行）
- 动作：新增 `.github/workflows/ci.yml`：
  - 触发 `push: branches: [master]` + `workflow_dispatch`；无 concurrency 组；全局 `env: HUSKY: '0'`。
  - `gate`（timeout 30）：checkout → `pnpm/action-setup@v4` → `setup-node@v4`（node 24, cache: pnpm）→ `pnpm install --frozen-lockfile` → `pnpm check`。
  - `docker-build`（timeout 40）：`docker/setup-buildx-action` → 构建两个 Dockerfile（tag `*:ci`，**不 push**）→ web 镜像 `docker run` + curl 启动冒烟。
  - `audit`（timeout 10）：checkout → `pnpm/action-setup@v4` → `pnpm audit --audit-level=high`，`continue-on-error: true`。
- 验收信号：一次 push master 三 job 全绿（audit 报警不红）；两个镜像在 job 内成功产出；web 冒烟 200。
- 不做：覆盖率、层缓存。

### S2 · 覆盖率并入（coverage job）
- 动作：新增 `coverage` job（与其余并行，无 needs）：`services` 声明 `postgres:15-alpine`（`POSTGRES_PASSWORD=postgres`，health-cmd `pg_isready -U postgres`）与 `redis:7-alpine`（health-cmd `redis-cli ping`）→ 复用安装步骤 → `turbo run test:coverage --filter=@multi-admin/nestjs-server`；timeout 40。
- 零配置改动依据：`test/setup-env.ts` 默认值 `localhost:5432/6379`、`postgres:postgres` 与 services 完全对齐；global-setup 幂等建库 `multi_admin_test`。
- 失败语义：≥80% 四指标为**报警式硬门槛**——job 红、不拦截。
- 验收信号：services 就绪 → migrate deploy → seed → 单测+e2e → 合并报表 ≥80% 通过。

### S3 · 收尾与硬化
- 动作：
  1. 既有根 `README.md` 头部追加 CI badge（仓库已存在根 README，无需新建）；
  2. `docs/engineering/build-and-verify.md` 改写「无 CI」章节为门禁分层（本地实时 + CI 异步兜底），并写入纪律条款「CI 红 → 下一项工作先修 CI」；`AGENTS.md` 现状描述同步；
  3. `docs/governance/backlog.md` 关闭「CI/CD 落地」与「依赖漏洞扫描」两项（行尾追加关闭标注，注明实现形态为 CI audit job）；
  4. 复盘 audit 报警噪音基线，决定是否收紧为失败级；
  5. docker 层缓存 `cache-from/to: type=gha`（构建时长成痛点时）。
- 验收信号：绕过本地钩子的坏提交被 CI 报红一次（演练）；两项 backlog 关闭；文档 `last_verified` 更新。

## 已拍板决策

| 编号 | 决策 | 结论 |
|---|---|---|
| E1 | e2e/覆盖率接入时机 | **B**：S1 先上 gate+docker+audit，S2 并入覆盖率 |
| E2 | 覆盖率门禁 | **B**：跑 `test:coverage`，≥80% 四指标报警式硬门槛 |
| E3 | Docker 验证深度 | **B**：web 镜像加启动冒烟；server 依赖 DB 只做 build |
| E4 | 依赖漏洞扫描 | **B**：纳入，`audit` job（`--audit-level=high`，v1 报警式） |
| E5 | 触发范围 | **仅 push master + workflow_dispatch**，去 PR 卡点、不设分支保护 |
| 确认1 | 覆盖率失败语义 | 报警式硬门槛（job 红、不拦截） |
| 确认2 | badge 载体 | 既有根 `README.md` 头部追加（无需新建） |
| 确认3 | audit 失败语义 | v1 报警式（`continue-on-error: true`） |

## 关键权衡（decision map）

| 决策主题 | 约束 | 选择 | 否决备选 | 理由 / 可逆性 |
|---|---|---|---|---|
| CI 定位 | 单人直推、不走 PR | 异步安全网（入库后验证） | 合并前门禁 | 分支保护对直推无效；价值保留为跨环境验证+镜像体检+纪律兜底 |
| CI 入口 | 本地/服务端口径必须一致 | 复用 `pnpm check` | CI 内重新拼装命令 | 结构性防漂移；完全可逆 |
| CD 边界 | 明确不正式发布 | 构建即弃，不 push registry | 推 GHCR 留存 | 零 secrets、零权限面；日后加 push 步骤即可（可逆） |
| Job 拓扑 | public 仓库分钟数无限 | 四 job 全并行（墙钟 ≈15~20 分钟） | gate 先行串行 | 免费场景下反馈延迟是唯一成本；串行仅在配额紧张时值得（可逆） |
| 并发策略 | 每次 push 都应被验证 | 不设 concurrency 组 | cancel-in-progress | 取消旧跑会在直推场景制造验证空洞 |
| 覆盖率设施 | 不在 runner 里跑 compose | GH Actions services | runner 内 compose | services 与 `setup-env.ts` 默认值零改动对齐 |
| electron 处置 | Linux runner 无法产 Windows 包 | CI 只覆盖其 typecheck（turbo 现状） | windows-latest job | 桌面发布另行立项（可逆） |
| audit 节奏 | 上游不可行动漏洞会造成红疲劳 | 两段式：v1 报警 → S3 复盘后收紧 | 直接失败级 | 保住「红了必看」的纪律价值（可逆） |
| 提交规范校验 | commitlint 目前只在本地钩子 | 维持现状，不在 CI 追验 | CI 校验历史提交 | 收益低噪音大（可逆） |

## 就绪检查（Readiness）

- [x] GitHub remote 已连接（`25lonelyboy/wewant-multi-admin`，public）
- [x] 默认分支 master 确认
- [x] `packageManager` 字段固定（pnpm/action-setup 免配版本）
- [x] `--frozen-lockfile` 前提成立（catalog + 单一 lockfile）
- [x] Dockerfile monorepo 形态（根 context + `--filter X...`）
- [x] e2e/coverage 默认值与 services 对齐（`test/setup-env.ts`）
- [x] 决策点 E1~E5 与三项确认拍板
- [ ] S0 本地冒烟（待执行）

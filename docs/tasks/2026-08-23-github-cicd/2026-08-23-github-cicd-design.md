---
status: approved
covers:
  - .github/workflows/ (待新增)
  - README.md (既有，头部追加 CI badge)
  - docs/engineering/build-and-verify.md (CI 落地后需同步)
  - docs/governance/backlog.md (CI/CD 落地 + 依赖漏洞扫描两项)
last_verified: 2026-08-24
produced_by: evolution-planner + brainstorming skill
---

# GitHub CI 演进摘要（CD 不发布，仅 Docker 构建验证；异步安全网定位）

## 定位：入库后的异步安全网，不是合并前门禁

用户工作流为直推 master / branch+worktree 本地合并，不走 GitHub PR。CI 定位因此重定：

| 维度 | 结论 |
|---|---|
| 触发 | 仅 `push` master + `workflow_dispatch`；无 `pull_request` |
| 角色 | 入库后异步验证；实时拦截由本地 `pnpm check` + husky 负责 |
| 分支保护 | **不启用**（对直推无效——它只约束 PR 合并；且明确不要卡点） |
| 失败语义 | 报警式：job 红但不拦截；红了必须被看到、被修 |
| 价值支柱 | ① 跨环境验证（Windows 本地 vs Linux CI）② Dockerfile 腐化的持续体检 ③ 直推跳过本地钩子时的唯一纪律兜底 ④ 未来协作时门禁现成可用 |

## 为什么现在可以做、而且代价小

仓库在「无 CI」阶段已把服务端验证需要的前置条件全部建好，本次演进是**增量接入**而非架构改造：

| 前置条件 | 现状证据 | 对 CI 的意义 |
|---|---|---|
| `pnpm check` 全量门禁 | `scripts/check.mjs`：prettier→typecheck→lint→stylelint→test，纯校验 | CI 质量门直接复用同一入口，本地/服务端口径一致 |
| turbo 任务图 | `turbo.json`，构建变体显式声明（ADR-005） | CI 无需重新定义任务依赖 |
| catalog + lockfile | `pnpm-workspace.yaml` catalog、`packageManager: pnpm@11.18.0` | `--frozen-lockfile` 可复现安装；pnpm/action-setup 免版本号 |
| Dockerfile×2 monorepo 化 | `apps/*/Dockerfile`：根 context + `--filter X...` + corepack 锁版本 | `docker build` 即验证，无需改镜像构建链 |
| e2e/coverage 默认环境 | `apps/nestjs-server/test/setup-env.ts` 默认 `localhost:5432/6379`、`postgres:postgres` | 与 GitHub Actions services 端口/账号天然对齐，零配置改动 |
| 覆盖率流水线 | `test:coverage` 合并单测+e2e，≥80% 硬门槛 | 原样提升为 CI 报警式门禁 |

**结论：影响面集中在新增 `.github/workflows/ci.yml` + ADR-006 + 既有根 README 追加 badge + Dockerfile 构建期优化（ARG 参数化 + 缓存清理），业务代码零改动。**

## 目标形态（approved）

- **触发**：`push: branches: [master]` + `workflow_dispatch`。**不设 concurrency 组**——直推工作流要求每次 push 都被验证，取消旧跑会制造验证空洞；public 仓库免费，全量跑。
- **全局 env**：`HUSKY: '0'`（声明式兜底，不依赖 husky 9.1.7 在 CI 下的行为假设）。
- **四个 job 全并行**（无 `needs` 依赖；墙钟 = 最长 job ≈ 15~20 分钟）：

| job | 内容 | 超时 |
|---|---|---|
| `gate` | checkout → pnpm/action-setup → setup-node(24, cache: pnpm) → `install --frozen-lockfile` → `pnpm check` | 30 min |
| `docker-build` | buildx 构建两镜像**不 push**；web 镜像加启动冒烟（run + curl） | 40 min |
| `coverage`（S2 并入） | services: postgres:15-alpine + redis:7-alpine → `turbo run test:coverage --filter=@multi-admin/nestjs-server`；≥80% 四指标为**报警式硬门槛** | 40 min |
| `audit` | `pnpm audit --audit-level=high`（只解析 lockfile，免 install）；v1 `continue-on-error` 报警式 | 10 min |

- 不使用 paths filter：public 免费、逻辑简单、docs 提交也过格式门禁；「跳过+分支保护死锁」陷阱在无分支保护场景不适用，理由仍记入 ADR-006。

## 影响面评估

| 范围 | 影响 | 说明 |
|---|---|---|
| 新增文件 | `.github/workflows/ci.yml`（约 100 行）；`docs/decisions/ADR-006-github-ci.md` | 全部为新增；既有根 `README.md` 头部追加 badge（S3） |
| 工程代码 | **业务代码零改动**；Dockerfile 构建期优化 | check.mjs / turbo.json / lockfile 原样复用；Dockerfile 改 ARG 参数化镜像源 + production-stage 安装后清理 pnpm 缓存（镜像瘦身 ~606MB） |
| 文档 | `build-and-verify.md`「无 CI」章节改写 + 纪律条款；`AGENTS.md` 现状同步；backlog 关闭「CI/CD 落地」「依赖漏洞扫描」两项 | living 文档口径必须跟上 |
| GitHub 侧配置 | 无（不设分支保护） | 仅需确认仓库 watch 通知开启 |
| electron-desktop | **不受影响**：`pnpm check` 只跑 typecheck（turbo 已对该端 `dependsOn: []` 特配） | 桌面端发布另行立项 |
| uni-mobile | 随 `turbo run test/typecheck` 自然覆盖 | 暂不单设 job |

## 需要提前规划 / 了解的点

1. **registry 策略（已落地）**：两个 Dockerfile 已将镜像源参数化为 `ARG`（默认国内 npmmirror，本地构建快），CI 通过 `build-args` 覆盖为官方源（runner 直连快）；`docker-compose.yml` 无需改动（直接用 ARG 默认值）。
2. **镜像瘦身（已落地）**：nestjs-server production-stage 安装完成后清理 pnpm 下载缓存（`/root/.cache/pnpm` ~543MB）与 store（`/root/.local/share/pnpm/store` ~401MB），镜像从 ~1.18GB 降至 ~571MB；硬链接不受影响。后续可评估 Prisma 7.x 捆绑依赖（`@prisma/studio-core` 42MB、`pglite` 23MB）是否可裁剪。
3. **缓存**：v1 只用 `setup-node cache: pnpm`；turbo 远程缓存与 docker 层缓存（`cache-to/from type=gha`）留到时长成痛点再加。
4. **husky 在 CI**：以 `HUSKY: '0'` 显式声明，不依赖第三方行为。
5. **换行符**：Linux runner checkout 得到 LF；Prettier `endOfLine: 'auto'` 不误报。（长期可选：`.gitattributes`。）
6. **secrets 为零**：不发布 = 无 registry 凭据、无部署目标；日后推镜像用内置 `GITHUB_TOKEN` + GHCR。
7. **audit 两段式**：v1 报警式（`continue-on-error` + `--audit-level=high`），S3 复盘噪音基线后再决定是否收紧为失败级。
8. **Docker 验证边界**：web 加启动冒烟；server 依赖 DB 只做 `build` 成功（运行验证由 coverage job 承担）。
9. **成本**：public 仓库 Actions 分钟数无限量；并行墙钟 15~20 分钟。已知冗余：单测在 gate 与 coverage 各跑一次——保持 `pnpm check` 入口一致性优先，接受。
10. **prisma generate 联网**：容器内构建与 runner 上 typecheck/test 均触发引擎二进制下载，GH runner 可达；Dockerfile 已用 `DATABASE_URL` 占位。

## 失败感知（报警式定位的强制配套）

不拦截，就必须有感知，三项全部纳入：

1. 既有根 `README.md` 头部追加 CI status badge——直推工作流下最直观的「红了可见」窗口（S3）。
2. GitHub watch 邮件通知（默认行为，确认仓库为 Watching）。
3. 纪律条款写入 `build-and-verify.md`：**CI 红 → 下一项工作先修 CI**。

## 主要风险

| 风险 | 缓解 |
|---|---|
| services 健康检查未就绪导致 coverage 首跑失败 | postgres/redis 配 `--health-*` options；global-setup 幂等建库 |
| 无层缓存时 docker build 慢（单镜像 10~15 分钟） | 接受现状（验证型构建）；痛点后加 `type=gha` 层缓存（注：BuildKit `--mount=type=cache` 跨 run 不生效，必须用 `type=gha`） |
| ~~npmmirror 在 GH runner 偶发不稳~~ | **已解决**：Dockerfile ARG 参数化 + CI `build-args` 覆盖官方源 |
| 本地与 CI 结论漂移 | 入口同为 `pnpm check`；`--frozen-lockfile` 封死依赖漂移 |
| 红疲劳（audit 上游不可行动高危 / coverage 波动） | 报警式 + S3 复盘收紧；纪律条款兜底 |

## 已拍板决策

`E1:B`（S2 并入覆盖率）`E2:B`（test:coverage ≥80%）`E3:B`（web 启动冒烟）`E4:B`（audit 纳入，报警式起步）`E5: push master，去 PR 卡点`；补充确认：覆盖率报警式硬门槛 / 根 README 承载 badge / audit v1 报警式。

## 下一步

切片与验收信号见同目录 `2026-08-23-github-cicd-roadmap.md`；差距图源码见 `2026-08-23-github-cicd-evolution.dot`；实施步骤见同目录实施计划文档。

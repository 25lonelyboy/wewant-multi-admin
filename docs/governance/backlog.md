---
status: living
covers:
  - apps/nestjs-server/
  - docker-compose.yml
  - .github/workflows/
last_verified: 2026-08-29
---

# 全局 backlog

各任务域识别但未处置关闭的登记项。每条含背景、触发条件与处置记录。

## 维护规范

1. **两表管理**：新识别项先进「开放」表；处置关闭后填写「处置方式」「关闭日期」两列并**移动**至「关闭」表，不删行。
2. **列格式**：开放表四列「项 / 背景 / 触发条件 / 日期（登记日期）」；关闭表六列「项 / 背景 / 触发条件 / 处置方式 / 关闭日期 / 登记日期」。
3. **重新登记**：关闭后需继续观察演进的（如「server 冒烟生产级演进」），作为新条目重新登记进开放表。
4. 每次维护后更新 frontmatter 的 `last_verified`。

## 开放

| 项 | 背景 | 触发条件 | 日期 |
|---|---|---|---|
| 子资源整体替换并发交错窗口 | 角色-菜单 / 用户-角色分配已实现 `$transaction` 原子（deleteMany+createMany），但 READ COMMITTED 下无行级锁，两个并发整体替换事务仍可能交错产生混合态 | 同一资源的真实并发管理操作出现（可考虑行锁/版本号加固） | 2026-08-21 |
| 管理员手动解锁端点 | 账号锁定目前仅 TTL 自动解锁（15 分钟），无误伤应急手段 | 运维需求或锁定误伤反馈 | 2026-08-27 |
| JWT secret 强度校验与轮换预案 | env.schema 对 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 仅 min(1) 校验，无强度下限（建议 min 32）与双密钥轮换流程 | 生产部署前（强度校验部分已关闭，2026-08-27，min(32) 强制，BREAKING；轮换预案仍开放） | 2026-08-23 |
| 审计日志（管理员操作审计） | 登录成功/失败、权限变更、软删除等关键操作无持久化审计记录；与 mine-logs 行关联但独立（后者是个人安全日志视图）；基础版范围已定（ADR-007）：登录事件 + 管理员敏感操作（改权限/软删除/重置密码/改密），全量业务审计待监控域扩 | 阶段 A（生产部署试点）或合规需求 | 2026-08-23 |
| 自助改密端点与会话吊销 | 无用户自助修改密码端点（仅管理员重置视角）；管理员重置密码后不吊销已签发会话，旧 token 继续有效至过期 | 真实多用户场景 | 2026-08-23 |
| metrics 指标 | 无 prom-client / `/metrics`（RPS/延迟/错误率/连接池水位不可观测）；健康检查为自研轻量探针（非 terminus），接入需独立引入依赖 | 阶段 B（首次真实流量/监控需求） | 2026-08-23 |
| 权限与动态路由 Redis 缓存 | 总 spec §6.5 承诺「permissions 从 Redis 缓存读」未落地，resolveSessionUser 每请求 3~4 次实时查库（设计-实现偏差） | 高并发或压测热点 | 2026-08-23 |
| 优雅停机统一超时治理 | enableShutdownHooks 已开且 Redis quit 已有 3s 竞速超时；缺 Prisma $disconnect 超时与 HTTP in-flight 请求 drain 上限 | 滚动发布或高流量场景 | 2026-08-23 |
| 数据库备份与恢复演练 | compose 仅数据卷，无 pg_dump 定时备份与恢复演练；形态已定（ADR-007）：pg_dump 定时 + 副本异地/异盘 + 恢复演练脚本（轻量，不引 pgBackRest，K8s/数据规模化再评估） | 阶段 A（生产部署试点） | 2026-08-23 |
| 写端点幂等键 | 写端点无 Idempotency-Key 去重，前端超时重试/双提交可产生重复数据；Redis 已有可实现 | 重试敏感业务场景 | 2026-08-23 |
| 登录响应 avatar 硬编码 null | auth.service profileOf 硬编码 avatar: null，User 表已有该字段，login/get-user-info 永远拿不到头像 | 头像功能启用（与头像上传行联动） | 2026-08-23 |
| OpenTelemetry 分布式追踪 | 当前仅 requestId 单服务内贯穿，无跨服务追踪；Redis 键空间已为 BullMQ 预留；日志目前仅 pino stdout，无采集/下沉与保留策略，监控域立项时应「日志+指标+追踪」三件套统一设计；终态微服务已定（ADR-007 D1）→ 追踪升级为「服务抽取前必备」 | 阶段 B（首次真实流量/监控域立项） | 2026-08-23 |
| e2e 套件级临时数据清理 | 当前以 `global-teardown` 全表 TRUNCATE 兜底 | 兜底失效或套件间数据污染复现 | 2026-08-21 |
| 高级密码策略 | argon2id 成本参数目前是强度底线，无复杂度 / 历史密码检查 | 多用户 / 多端真实接入场景出现 | 2026-08-21 |
| restore 端点 / 超管标志位化 / 单测覆盖率下限棘轮 / 防环 DB 层加固 | 已识别未实施 | 相应主题立项时逐项处置 | 2026-08-21 |
| dept / 监控域后端实现 | 前端 views / api / mock 已就位并降级空态，后端未实现 | 两域业务需求立项（届时 seed 菜单树恢复节点） | 2026-08-21 |
| mine-logs 个人安全日志 | `/api/v1/mine-logs` 仅 mock 供数，后端未实现 | 监控域登录日志立项时统一设计 SecurityLog 数据源 | 2026-08-21 |
| 头像上传与文件存储 | `avatar` 目前为字符串字段（URL 或 null），无上传端点 | 文件存储基建（本地盘 / 对象存储 + 上传端点）引入时 | 2026-08-21 |
| schema.prisma 多文件拆分 | 当前单文件 99 行 / 5 模型健康；业务域扩展（监控 / dept / 文件存储）后单文件将膨胀。Prisma 7 的 `prisma.config.ts` schema 字段支持目录/文件数组（multi-file），全库仅一个 datasource + generator 为硬约束；拆分需一次改齐 prisma.config.ts、prisma 脚本与 Dockerfile COPY 路径（以 7.9.x 官方文档确认目录/数组写法）；现阶段维持单文件并确立「按域分节」书写约定 | 模型数 > ~25 或行数 > ~600 或第二限界上下文立项 | 2026-08-26 |
| test/ e2e 分层 | 当前 test/ 根混放 7 个基建/引导文件（jest 配置、global-setup/teardown、e2e-env、strip-import-meta 等）与域 spec，`helpers/`、`fixtures/` 已分出；dept/monitor e2e 已立项，届时根目录将再堆多个 `*.e2e-spec.ts`（system.e2e-spec 已 20KB）。方案：域 spec 下沉 `test/e2e/<domain>.e2e-spec.ts`，基建留根或收敛 `test/support/`，同步调整 `jest-e2e.cjs` 的 roots/testMatch 与 helpers 相对导入 | 新增第一个非 auth/system 域 e2e（dept/monitor 立项时一并迁移，避免双路径并存） | 2026-08-26 |
| module 注册域聚合约定 | `app.module.ts` 8 import 尚健康；防膨胀策略延续 `SystemModule` 聚合模式（域聚合模块包 leaf，app.module 只 import 聚合）；明确拒绝反射/目录扫描式自动注册（破坏 DI 可发现性，与薄壳显式哲学相悖）；全局 `APP_GUARD/APP_FILTER` provider 留组合根 | 域聚合 > ~5 或 app.module import > ~15（可引入 `src/domains/` 物理聚拢） | 2026-08-26 |
| common/ 外部中间件适配器上提 | `common/` 现混放框架约定（guards/filters/decorators/errors 等，纯 NestJS）与外部适配薄壳（redis/logging/throttler）；Prisma 适配器已独立 `database/`，概念缝隙已隐式存在；方案：`redis/`、`logging/`、`throttler/` 随下一个外部适配器一起上提 `src/infra/`，形成「infra = 外部薄壳、common = 框架约定」二分 | 第二个外部中间件适配器（BullMQ / 对象存储等）引入 | 2026-08-26 |
| CI PR 门禁与分支保护 | CI 现仅入库后验（push master，报警式，ADR-006 刻意决策），团队扩张或 agent 自动提交增多时 master 存在红构建无人拦截；迁移成本低：gate job 增 `pull_request` 触发器 + 开分支保护 | 阶段 E（第二协作者加入或开始接受外部 PR） | 2026-08-26 |
| server 冒烟生产级演进 | 现有形态适配「无 registry / 单 job」现状；演进信号：① 镜像开始 push registry（CD 制品策略落地）→ 冒烟拆独立 job、按 digest 拉取同源产物；② 出现事务性冒烟需求（seed 凭据登录 + 业务读写闭环）→ 探测升级；③ 第二运行时依赖（BullMQ）→ 迁移 compose/Testcontainers | 任一信号出现时立项 | 2026-08-29 |
| 供应链加固 | ① 无 Dependabot/Renovate，依赖更新仅靠 `pnpm audit` 事后报警；② 无镜像内容扫描（Trivy/Grype），基础镜像与 OS 层漏洞无感知；③ GitHub Actions 版本钉 major（`checkout@v4`），企业实践钉 commit SHA。方案已定（ADR-007）：Renovate 公有 GitHub App（`.renovaterc.json`，需确认 pnpm manager 同管 catalog 与 lockfile）；Trivy 入 CI 报警式（docker-build 加一步 + 漏洞库缓存）；check-digests 季度刷新在 Renovate 落地后退役 | 阶段 A（生产部署试点） | 2026-08-26 |
| CD 制品策略规划 | 无镜像版本 / tag 策略（CI 仅 `multi-admin-*:ci`）、无 registry 选型、无多环境变量矩阵（仅一套 `.env.example`）、未定 secrets 注入路径（GitHub Secrets → 部署目标）；方向已定（ADR-007 D3）：自建 registry（Harbor 类），部署 VM docker 优先、K8s 可选（OCI 镜像兼容两者） | 阶段 E（第二协作者或 CD 立项） | 2026-08-26 |
| system 域只读查询门面 | `auth.service` 直查 system 域表（permissionsOf / getAsyncRoutes / findUserWithRoles 直接 `prisma.role/menu/user`），监控 / dept 域立项后多域直查将使表结构变更影响面发散；方案：抽取 `SystemQueryService` 只读门面，各域统一经门面访问 | 第二个需用户/角色信息的域立项 | 2026-08-26 |
| Prisma 迁移回滚预案 | Prisma 不支持 down 迁移，`migrate deploy` 单向，生产迁移中途失败无回退剧本；方案：破坏性迁移（删列/改类型）提交时附带手写回滚 SQL（migration 注释或独立文件） | 第一次破坏性 schema 变更前 | 2026-08-26 |
| pure-web 测试基建与 strict 类型安全 | pure-web 零测试（0 spec 文件、无 vitest 依赖）且为全仓唯一 `strict: false` 端（纯 TS 384 个 strict 错误实测），token 刷新状态机 / 动态路由重建 / 按钮级鉴权均无回归保护；总体设计已定稿（双 tsconfig 分层 + vitest 基建 + 模块级 ≥80% 覆盖 + 上游基线前置） | 本任务立项执行中（见 docs/tasks/2026-08-29-pure-web-testing-foundation/） | 2026-08-29 |
| pure-web E2E 测试基建 | 组件级测试完成后仍缺登录 → 动态路由全链路浏览器级回归；方案：Playwright，登录全链路 + 关键页面冒烟 | B2（状态机/store 测试）完成后评估启动 | 2026-08-29 |
| pure-web 遗留组件处置 | 24 个组件目录中 9 个零引用（ReBarcode/ReDrawer/ReFlop/ReSeamlessScroll/ReSelector/ReSplitPane/ReTreeLine/ReCropper/ReVxeTableBar），pure-admin 遗留资产；本任务只盘点豁免不删除，删除/保留决策待盘点清单入库后另行立项 | 盘点清单入库后决策 | 2026-08-29 |
| pure-web 上游同步周期评估 | vue-pure-admin template 衍生（接入 2026-08-10），无 fork 跟踪机制；方案：基线 SHA 记录 + ops/upstream-diff.sh 差异报告 + 选择性吸收（吸收项走 strict 迁入 + 测试验收） | 上游大版本发布或季度触发 | 2026-08-29 |
| pure-web strict 迁移最终态收口 | 双 tsconfig + 清单断言 + pre-commit 拦截均为迁移期机制；存量全部迁入后须一次性收口：`tsconfig.strict.json` 清单并回 `tsconfig.json`（strict 直承）、删除 strict config / exemptions / `assert-strict-manifest.mjs`、`check.mjs` 与 `.husky/pre-commit` 移除断言阶段 | 批次 B 全部子任务完成（存量文件全部迁入清单）后 | 2026-08-29 |

## 已关闭

| 项 | 背景 | 触发条件 | 处置方式 | 关闭日期 | 登记日期 |
|---|---|---|---|---|---|
| 生产安全基线加固 | ① Dockerfile 无 `USER` 指令容器以 root 运行；② `node:24-alpine`/`postgres:15-alpine`/`redis:7-alpine` 无 digest pin（不可复现构建）；③ 请求体大小依赖 Express 默认 100kb 未显式声明 | 生产部署前 | ①② 非 root + digest pin 落地（见 docs/tasks/archive/2026-08-27-server-security-baseline/）；③ BODY_LIMIT / UPLOAD_BODY_LIMIT env 可配置，全局 1mb + 上传路由 10mb | ①② 2026-08-28；③ 2026-08-27 | 2026-08-23 |
| 登录限流账号维度与失败锁定 | 登录端点限流仅 IP 维度（5/min/IP），无按 username 的失败计数/临时锁定，分布式爆破与共享出口 IP 误伤两类风险均未覆盖 | 公网暴露或真实多用户接入 | 账号维度失败计数 + 15 分钟临时锁定，LoginLockGuard 前置 + 混合错误语义 42301 | 2026-08-27 | 2026-08-23 |
| 依赖漏洞扫描 | `pnpm check` 门禁无 audit 环节，供应链风险无感知 | 生产部署前或 CI 落地时 | CI `audit` job：`pnpm audit --audit-level=high` 报警式，收紧复盘见 S3 记录 | 2026-08-25 | 2026-08-23 |
| 校验错误字段级明细 | ValidationPipe 字段错误被全局过滤器折叠为固定文案「参数校验失败」（resolveException 对 BadRequestException 丢明细）；信封 data 可扩展 errors 数组 | 前端联调体验优化 | exceptionFactory 递归展开 `{ field, message }[]` 经 data.errors 返回，含嵌套 DTO 点分路径 | 2026-08-27 | 2026-08-23 |
| Prisma 慢查询日志与连接池显式配置 | PrismaClient 无 log 配置（无慢查询观测，错误直打 stderr 不走 pino）；PrismaPg 无显式连接池 max（pg 默认 10）。方案：`log: [{ level: 'query', emit: 'event' }]` + `$on('query')` 按 duration 阈值过滤后转投 nestjs-pino（携带 requestId，与请求链关联）；带 `PRISMA_QUERY_LOG` env 运行时开关供生产临时排障（看具体 SQL + 参数，排障窗口期开启、事后关闭）；配套 postgres 侧 `log_min_duration_statement` 常态兜慢查询 | 生产上线或压测 | `$on('query')` 阈值 warn + 全量日志开关 + 连接池 max 显式配置；慢/全量文案已区分 | 2026-08-27 | 2026-08-23 |
| CI/CD 落地 | 质量门禁仅本地 `pnpm check` + husky，无自动化构建/扫描/镜像发布；AGENTS.md 明示无 CI 现状 | 用户决策引入 CI 基础设施 | `.github/workflows/ci.yml` 四 job 异步安全网，ADR-006 | 2026-08-25 | 2026-08-23 |
| electron-desktop prebuild 构建链 | `prebuild` 直接调 pure-web build 但未先构建 contracts 包，干净工作区首次 `build:desktop` 会因 `dist/` 不存在而断链 | electron-desktop 构建链路改造或 contracts 第二个消费者出现时补 `prebuild` 钩子 | turbo 任务图取代钩子编排，ADR-005 | 2026-08-23 | 2026-08-21 |
| contracts 包缺 lint / format 脚本 | `packages/contracts` 仅有 build / typecheck / test，无独立 lint 与 format 校验 | contracts 消费者增至 2 个以上时补齐 | 补齐 lint / format 脚本与 eslint 薄壳，turbo 迁移任务 | 2026-08-23 | 2026-08-21 |
| server 镜像启动冒烟 | docker-build job 仅 web 镜像有启动冒烟（curl 200 重试），server 镜像只构建不运行，entrypoint 链（migrate → seed → node）问题构建期不可见；可复用 coverage job 的 postgres/redis service 模式加 compose 式 `/health` 探测 | server 镜像首次进入真实部署链路前 | docker-build job 加 postgres/redis services（digest pin 沿用安全基线）+ /health 探针冒烟，server-smoke.sh 本地/CI 同源；check-digests 计数边界 8 → 10 | 2026-08-29 | 2026-08-26 |
| BODY_LIMIT / UPLOAD_BODY_LIMIT 格式正则校验 | 曾考虑在 env.schema 对 body limit 字符串加格式正则拦截无效配置；结论：express 启动时对非法 limit 已 fail-fast 抛错（`option limit "x" is invalid`），正则收益仅报错文案且有误拒合法格式（如 1.5mb）风险 | 配置错误导致启动报错信息确实引起运维困扰时再评估 | 不实施 | 2026-08-27 | 2026-08-27 |

---
status: living
covers:
  - apps/nestjs-server/
  - docker-compose.yml
  - .github/workflows/
last_verified: 2026-08-28
---

# 全局 backlog

各任务域识别但未处置关闭的登记项。每行含来源、结论与重新触发条件；关闭时在行尾追加「（已关闭，YYYY-MM-DD）」标注，不删行。

| 项 | 背景与触发条件 |
|---|---|
| 子资源整体替换并发交错窗口 | 角色-菜单 / 用户-角色分配已实现 `$transaction` 原子（deleteMany+createMany），但 READ COMMITTED 下无行级锁，两个并发整体替换事务仍可能交错产生混合态；触发：同一资源的真实并发管理操作出现（可考虑行锁/版本号加固） |
| 生产安全基线加固 | ① Dockerfile 无 `USER` 指令容器以 root 运行；② `node:24-alpine`/`postgres:15-alpine`/`redis:7-alpine` 无 digest pin（不可复现构建）；③ 请求体大小依赖 Express 默认 100kb 未显式声明；触发：生产部署前（①②已关闭，2026-08-28，非 root + digest pin 落地，见 docs/tasks/archive/2026-08-27-server-security-baseline/；③ 已关闭，2026-08-27，BODY_LIMIT / UPLOAD_BODY_LIMIT env 可配置，全局 1mb + 上传路由 10mb） |
| 登录限流账号维度与失败锁定 | 登录端点限流仅 IP 维度（5/min/IP），无按 username 的失败计数/临时锁定，分布式爆破与共享出口 IP 误伤两类风险均未覆盖；触发：公网暴露或真实多用户接入（已关闭，2026-08-27，实现形态为账号维度失败计数 + 15 分钟临时锁定，LoginLockGuard 前置 + 混合错误语义 42301） |
| 管理员手动解锁端点 | 账号锁定目前仅 TTL 自动解锁（15 分钟），无误伤应急手段；触发：运维需求或锁定误伤反馈 |
| JWT secret 强度校验与轮换预案 | env.schema 对 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 仅 min(1) 校验，无强度下限（建议 min 32）与双密钥轮换流程；触发：生产部署前（强度校验部分已关闭，2026-08-27，min(32) 强制，BREAKING；轮换预案仍开放） |
| 审计日志（管理员操作审计） | 登录成功/失败、权限变更、软删除等关键操作无持久化审计记录；与 mine-logs 行关联但独立（后者是个人安全日志视图）；触发：监控域立项或合规需求 |
| 依赖漏洞扫描 | `pnpm check` 门禁无 audit 环节，供应链风险无感知；触发：生产部署前或 CI 落地时（已关闭，2026-08-25，实现形态为 CI `audit` job：`pnpm audit --audit-level=high` 报警式，收紧复盘见 S3 记录） |
| 自助改密端点与会话吊销 | 无用户自助修改密码端点（仅管理员重置视角）；管理员重置密码后不吊销已签发会话，旧 token 继续有效至过期；触发：真实多用户场景 |
| metrics 指标 | 无 prom-client / `/metrics`（RPS/延迟/错误率/连接池水位不可观测）；健康检查为自研轻量探针（非 terminus），接入需独立引入依赖；触发：生产上线或监控需求 |
| 权限与动态路由 Redis 缓存 | 总 spec §6.5 承诺「permissions 从 Redis 缓存读」未落地，resolveSessionUser 每请求 3~4 次实时查库（设计-实现偏差）；触发：高并发或压测热点 |
| 校验错误字段级明细 | ValidationPipe 字段错误被全局过滤器折叠为固定文案「参数校验失败」（resolveException 对 BadRequestException 丢明细）；信封 data 可扩展 errors 数组；触发：前端联调体验优化（已关闭，2026-08-27，exceptionFactory 递归展开 `{ field, message }[]` 经 data.errors 返回，含嵌套 DTO 点分路径） |
| Prisma 慢查询日志与连接池显式配置 | PrismaClient 无 log 配置（无慢查询观测，错误直打 stderr 不走 pino）；PrismaPg 无显式连接池 max（pg 默认 10）。方案：`log: [{ level: 'query', emit: 'event' }]` + `$on('query')` 按 duration 阈值过滤后转投 nestjs-pino（携带 requestId，与请求链关联）；带 `PRISMA_QUERY_LOG` env 运行时开关供生产临时排障（看具体 SQL + 参数，排障窗口期开启、事后关闭）；配套 postgres 侧 `log_min_duration_statement` 常态兜慢查询；触发：生产上线或压测（已关闭，2026-08-27，$on('query') 阈值 warn + 全量日志开关 + 连接池 max 显式配置；慢/全量文案已区分） |
| 优雅停机统一超时治理 | enableShutdownHooks 已开且 Redis quit 已有 3s 竞速超时；缺 Prisma $disconnect 超时与 HTTP in-flight 请求 drain 上限；触发：滚动发布或高流量场景 |
| 数据库备份与恢复演练 | compose 仅数据卷，无 pg_dump 定时备份与恢复演练；触发：生产数据规模化 |
| 写端点幂等键 | 写端点无 Idempotency-Key 去重，前端超时重试/双提交可产生重复数据；Redis 已有可实现；触发：重试敏感业务场景 |
| 登录响应 avatar 硬编码 null | auth.service profileOf 硬编码 avatar: null，User 表已有该字段，login/get-user-info 永远拿不到头像；触发：头像功能启用（与头像上传行联动） |
| CI/CD 落地 | 质量门禁仅本地 `pnpm check` + husky，无自动化构建/扫描/镜像发布；AGENTS.md 明示无 CI 现状；触发：用户决策引入 CI 基础设施（已关闭，2026-08-25，实现形态为 `.github/workflows/ci.yml` 四 job 异步安全网，ADR-006） |
| OpenTelemetry 分布式追踪 | 当前仅 requestId 单服务内贯穿，无跨服务追踪；Redis 键空间已为 BullMQ 预留；日志目前仅 pino stdout，无采集/下沉与保留策略，监控域立项时应「日志+指标+追踪」三件套统一设计；触发：微服务化/跨服务排障需求或监控域立项 |
| e2e 套件级临时数据清理 | 当前以 `global-teardown` 全表 TRUNCATE 兜底；触发：兜底失效或套件间数据污染复现 |
| 高级密码策略 | argon2id 成本参数目前是强度底线，无复杂度 / 历史密码检查；触发：多用户 / 多端真实接入场景出现 |
| restore 端点 / 超管标志位化 / 单测覆盖率下限棘轮 / 防环 DB 层加固 | 已识别未实施；触发：相应主题立项时逐项处置 |
| dept / 监控域后端实现 | 前端 views / api / mock 已就位并降级空态，后端未实现；触发：两域业务需求立项（届时 seed 菜单树恢复节点） |
| mine-logs 个人安全日志 | `/api/v1/mine-logs` 仅 mock 供数，后端未实现；触发：监控域登录日志立项时统一设计 SecurityLog 数据源 |
| 头像上传与文件存储 | `avatar` 目前为字符串字段（URL 或 null），无上传端点；触发：文件存储基建（本地盘 / 对象存储 + 上传端点）引入时 |
| electron-desktop prebuild 构建链 | `prebuild` 直接调 pure-web build 但未先构建 contracts 包，干净工作区首次 `build:desktop` 会因 `dist/` 不存在而断链；触发：electron-desktop 构建链路改造或 contracts 第二个消费者出现时补 `prebuild` 钩子（已关闭，2026-08-23，turbo 任务图取代钩子编排，ADR-005） |
| contracts 包缺 lint / format 脚本 | `packages/contracts` 仅有 build / typecheck / test，无独立 lint 与 format 校验；触发：contracts 消费者增至 2 个以上时补齐（已关闭，2026-08-23，补齐 lint / format 脚本与 eslint 薄壳，turbo 迁移任务） |
| schema.prisma 多文件拆分 | 当前单文件 99 行 / 5 模型健康；业务域扩展（监控 / dept / 文件存储）后单文件将膨胀。Prisma 7 的 `prisma.config.ts` schema 字段支持目录/文件数组（multi-file），全库仅一个 datasource + generator 为硬约束；拆分需一次改齐 prisma.config.ts、prisma 脚本与 Dockerfile COPY 路径（以 7.9.x 官方文档确认目录/数组写法）；现阶段维持单文件并确立「按域分节」书写约定；触发：模型数 > ~25 或行数 > ~600 或第二限界上下文立项 |
| test/ e2e 分层 | 当前 test/ 根混放 7 个基建/引导文件（jest 配置、global-setup/teardown、e2e-env、strip-import-meta 等）与域 spec，`helpers/`、`fixtures/` 已分出；dept/monitor e2e 已立项，届时根目录将再堆多个 `*.e2e-spec.ts`（system.e2e-spec 已 20KB）。方案：域 spec 下沉 `test/e2e/<domain>.e2e-spec.ts`，基建留根或收敛 `test/support/`，同步调整 `jest-e2e.cjs` 的 roots/testMatch 与 helpers 相对导入；触发：新增第一个非 auth/system 域 e2e（dept/monitor 立项时一并迁移，避免双路径并存） |
| module 注册域聚合约定 | `app.module.ts` 8 import 尚健康；防膨胀策略延续 `SystemModule` 聚合模式（域聚合模块包 leaf，app.module 只 import 聚合）；明确拒绝反射/目录扫描式自动注册（破坏 DI 可发现性，与薄壳显式哲学相悖）；全局 `APP_GUARD/APP_FILTER` provider 留组合根；触发：域聚合 > ~5 或 app.module import > ~15（可引入 `src/domains/` 物理聚拢） |
| common/ 外部中间件适配器上提 | `common/` 现混放框架约定（guards/filters/decorators/errors 等，纯 NestJS）与外部适配薄壳（redis/logging/throttler）；Prisma 适配器已独立 `database/`，概念缝隙已隐式存在；方案：`redis/`、`logging/`、`throttler/` 随下一个外部适配器一起上提 `src/infra/`，形成「infra = 外部薄壳、common = 框架约定」二分；触发：第二个外部中间件适配器（BullMQ / 对象存储等）引入 |
| CI PR 门禁与分支保护 | CI 现仅入库后验（push master，报警式，ADR-006 刻意决策），团队扩张或 agent 自动提交增多时 master 存在红构建无人拦截；迁移成本低：gate job 增 `pull_request` 触发器 + 开分支保护；触发：第二协作者加入或开始接受外部 PR |
| server 镜像启动冒烟 | docker-build job 仅 web 镜像有启动冒烟（curl 200 重试），server 镜像只构建不运行，entrypoint 链（migrate → seed → node）问题构建期不可见；可复用 coverage job 的 postgres/redis service 模式加 compose 式 `/health` 探测；触发：server 镜像首次进入真实部署链路前（已关闭，2026-08-29：docker-build job 加 postgres/redis services（digest pin 沿用安全基线）+ /health 探针冒烟，server-smoke.sh 本地/CI 同源；check-digests 计数边界 8 → 10） |
| server 冒烟生产级演进 | 现有形态适配「无 registry / 单 job」现状；演进信号：① 镜像开始 push registry（CD 制品策略落地）→ 冒烟拆独立 job、按 digest 拉取同源产物；② 出现事务性冒烟需求（seed 凭据登录 + 业务读写闭环）→ 探测升级；③ 第二运行时依赖（BullMQ）→ 迁移 compose/Testcontainers；触发：任一信号出现时立项 |
| 供应链加固 | ① 无 Dependabot/Renovate，依赖更新仅靠 `pnpm audit` 事后报警；② 无镜像内容扫描（Trivy/Grype），基础镜像与 OS 层漏洞无感知；③ GitHub Actions 版本钉 major（`checkout@v4`），企业实践钉 commit SHA；触发：生产部署前 |
| CD 制品策略规划 | 无镜像版本 / tag 策略（CI 仅 `multi-admin-*:ci`）、无 registry 选型、无多环境变量矩阵（仅一套 `.env.example`）、未定 secrets 注入路径（GitHub Secrets → 部署目标）；三项越早定未来 CD 越便宜；触发：CD 立项时 |
| system 域只读查询门面 | `auth.service` 直查 system 域表（permissionsOf / getAsyncRoutes / findUserWithRoles 直接 `prisma.role/menu/user`），监控 / dept 域立项后多域直查将使表结构变更影响面发散；方案：抽取 `SystemQueryService` 只读门面，各域统一经门面访问；触发：第二个需用户/角色信息的域立项 |
| BODY_LIMIT / UPLOAD_BODY_LIMIT 格式正则校验 | 曾考虑在 env.schema 对 body limit 字符串加格式正则拦截无效配置；结论：express 启动时对非法 limit 已 fail-fast 抛错（`option limit "x" is invalid`），正则收益仅报错文案且有误拒合法格式（如 1.5mb）风险；触发：配置错误导致启动报错信息确实引起运维困扰时再评估（已关闭，2026-08-27，不实施） |
| Prisma 迁移回滚预案 | Prisma 不支持 down 迁移，`migrate deploy` 单向，生产迁移中途失败无回退剧本；方案：破坏性迁移（删列/改类型）提交时附带手写回滚 SQL（migration 注释或独立文件）；触发：第一次破坏性 schema 变更前 |

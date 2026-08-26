---
status: living
covers:
  - apps/nestjs-server/
  - docker-compose.yml
last_verified: 2026-08-26
---

# 全局 backlog

各任务域识别但未处置关闭的登记项。每行含来源、结论与重新触发条件；关闭时在行尾追加「（已关闭，YYYY-MM-DD）」标注，不删行。

| 项 | 背景与触发条件 |
|---|---|
| 子资源整体替换并发交错窗口 | 角色-菜单 / 用户-角色分配已实现 `$transaction` 原子（deleteMany+createMany），但 READ COMMITTED 下无行级锁，两个并发整体替换事务仍可能交错产生混合态；触发：同一资源的真实并发管理操作出现（可考虑行锁/版本号加固） |
| 生产安全基线加固 | ① Dockerfile 无 `USER` 指令容器以 root 运行；② `node:24-alpine`/`postgres:15-alpine`/`redis:7-alpine` 无 digest pin（不可复现构建）；③ 请求体大小依赖 Express 默认 100kb 未显式声明；触发：生产部署前 |
| 登录限流账号维度与失败锁定 | 登录端点限流仅 IP 维度（5/min/IP），无按 username 的失败计数/临时锁定，分布式爆破与共享出口 IP 误伤两类风险均未覆盖；触发：公网暴露或真实多用户接入 |
| JWT secret 强度校验与轮换预案 | env.schema 对 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 仅 min(1) 校验，无强度下限（建议 min 32）与双密钥轮换流程；触发：生产部署前 |
| 审计日志（管理员操作审计） | 登录成功/失败、权限变更、软删除等关键操作无持久化审计记录；与 mine-logs 行关联但独立（后者是个人安全日志视图）；触发：监控域立项或合规需求 |
| 依赖漏洞扫描 | `pnpm check` 门禁无 audit 环节，供应链风险无感知；触发：生产部署前或 CI 落地时（已关闭，2026-08-25，实现形态为 CI `audit` job：`pnpm audit --audit-level=high` 报警式，收紧复盘见 S3 记录） |
| 自助改密端点与会话吊销 | 无用户自助修改密码端点（仅管理员重置视角）；管理员重置密码后不吊销已签发会话，旧 token 继续有效至过期；触发：真实多用户场景 |
| metrics 指标 | 无 prom-client / `/metrics`（RPS/延迟/错误率/连接池水位不可观测）；健康检查为自研轻量探针（非 terminus），接入需独立引入依赖；触发：生产上线或监控需求 |
| 权限与动态路由 Redis 缓存 | 总 spec §6.5 承诺「permissions 从 Redis 缓存读」未落地，resolveSessionUser 每请求 3~4 次实时查库（设计-实现偏差）；触发：高并发或压测热点 |
| 校验错误字段级明细 | ValidationPipe 字段错误被全局过滤器折叠为固定文案「参数校验失败」（resolveException 对 BadRequestException 丢弃明细）；信封 data 可扩展 errors 数组；触发：前端联调体验优化 |
| Prisma 慢查询日志与连接池显式配置 | PrismaClient 无 log 配置（无慢查询观测）；PrismaPg 无显式连接池 max（pg 默认 10）；触发：生产上线或压测 |
| 优雅停机统一超时治理 | enableShutdownHooks 已开且 Redis quit 已有 3s 竞速超时；缺 Prisma $disconnect 超时与 HTTP in-flight 请求 drain 上限；触发：滚动发布或高流量场景 |
| 数据库备份与恢复演练 | compose 仅数据卷，无 pg_dump 定时备份与恢复演练；触发：生产数据规模化 |
| 写端点幂等键 | 写端点无 Idempotency-Key 去重，前端超时重试/双提交可产生重复数据；Redis 已有可实现；触发：重试敏感业务场景 |
| 登录响应 avatar 硬编码 null | auth.service profileOf 硬编码 avatar: null，User 表已有该字段，login/get-user-info 永远拿不到头像；触发：头像功能启用（与头像上传行联动） |
| CI/CD 落地 | 质量门禁仅本地 `pnpm check` + husky，无自动化构建/扫描/镜像发布；AGENTS.md 明示无 CI 现状；触发：用户决策引入 CI 基础设施（已关闭，2026-08-25，实现形态为 `.github/workflows/ci.yml` 四 job 异步安全网，ADR-006） |
| OpenTelemetry 分布式追踪 | 当前仅 requestId 单服务内贯穿，无跨服务追踪；Redis 键空间已为 BullMQ 预留；触发：微服务化/跨服务排障需求 |
| e2e 套件级临时数据清理 | 当前以 `global-teardown` 全表 TRUNCATE 兜底；触发：兜底失效或套件间数据污染复现 |
| 高级密码策略 | argon2id 成本参数目前是强度底线，无复杂度 / 历史密码检查；触发：多用户 / 多端真实接入场景出现 |
| restore 端点 / 超管标志位化 / 单测覆盖率下限棘轮 / 防环 DB 层加固 | 已识别未实施；触发：相应主题立项时逐项处置 |
| dept / 监控域后端实现 | 前端 views / api / mock 已就位并降级空态，后端未实现；触发：两域业务需求立项（届时 seed 菜单树恢复节点） |
| mine-logs 个人安全日志 | `/api/v1/mine-logs` 仅 mock 供数，后端未实现；触发：监控域登录日志立项时统一设计 SecurityLog 数据源 |
| 头像上传与文件存储 | `avatar` 目前为字符串字段（URL 或 null），无上传端点；触发：文件存储基建（本地盘 / 对象存储 + 上传端点）引入时 |
| electron-desktop prebuild 构建链 | `prebuild` 直接调 pure-web build 但未先构建 contracts 包，干净工作区首次 `build:desktop` 会因 `dist/` 不存在而断链；触发：electron-desktop 构建链路改造或 contracts 第二个消费者出现时补 `prebuild` 钩子（已关闭，2026-08-23，turbo 任务图取代钩子编排，ADR-005） |
| contracts 包缺 lint / format 脚本 | `packages/contracts` 仅有 build / typecheck / test，无独立 lint 与 format 校验；触发：contracts 消费者增至 2 个以上时补齐（已关闭，2026-08-23，补齐 lint / format 脚本与 eslint 薄壳，turbo 迁移任务） |

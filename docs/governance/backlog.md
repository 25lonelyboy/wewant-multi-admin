---
status: living
covers:
  - apps/nestjs-server/
  - docker-compose.yml
  - .github/workflows/
last_verified: 2026-11-08
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
| JWT secret 强度校验与轮换预案 | env.schema 已强制 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET ≥32 字符（BREAKING）；双密钥轮换流程仍未建立 | 生产部署前（强度校验已于 2026-08-27 关闭；轮换预案仍开放） | 2026-08-23 |
| 审计日志（管理员操作审计） | 登录成功/失败、权限变更、软删除等关键操作无持久化审计记录；与 mine-logs 行关联但独立（后者是个人安全日志视图）；基础版范围已定（ADR-007）：登录事件 + 管理员敏感操作（改权限/软删除/重置密码/改密），全量业务审计待监控域扩 | 阶段 A（生产部署试点）或合规需求 | 2026-08-23 |
| 自助改密端点与会话吊销 | 无用户自助修改密码端点（仅管理员重置视角）；管理员重置密码后不吊销已签发会话，旧 token 继续有效至过期 | 真实多用户场景 | 2026-08-23 |
| metrics 指标 | 无 prom-client / `/metrics`（RPS/延迟/错误率/连接池水位不可观测）；健康检查为自研轻量探针（非 terminus），接入需独立引入依赖。⚠️ **iot-worker 按设计不开 HTTP**，`/metrics` 这条路对它不适用——它的队列积压、写入速率、降采样延迟需要另立出口（推送式或旁路读 Redis/TDengine） | 阶段 B（首次真实流量/监控需求）；iot 链路另见：出现「队列积压多久、降采样落后多少」必须量化时 | 2026-08-23 |
| 权限与动态路由 Redis 缓存 | permissions 未走 Redis 缓存，resolveSessionUser 每请求 3~4 次实时查库 | 高并发或压测热点 | 2026-08-23 |
| 优雅停机统一超时治理 | enableShutdownHooks 已开且 Redis quit 已有 3s 竞速超时；缺 Prisma $disconnect 超时与 HTTP in-flight 请求 drain 上限 | 滚动发布或高流量场景 | 2026-08-23 |
| 数据库备份与恢复演练 | compose 仅数据卷，无 pg_dump 定时备份与恢复演练；形态已定（ADR-007）：pg_dump 定时 + 副本异地/异盘 + 恢复演练脚本（轻量，不引 pgBackRest，K8s/数据规模化再评估） | 阶段 A（生产部署试点） | 2026-08-23 |
| 写端点幂等键 | 写端点无 Idempotency-Key 去重，前端超时重试/双提交可产生重复数据；Redis 已有可实现 | 重试敏感业务场景 | 2026-08-23 |
| 登录响应 avatar 硬编码 null | auth.service profileOf 硬编码 avatar: null，User 表已有该字段，login/get-user-info 永远拿不到头像 | 头像功能启用（与头像上传行联动） | 2026-08-23 |
| OpenTelemetry 分布式追踪 | 当前仅 requestId 单服务内贯穿，无跨服务追踪；Redis 键空间已为 BullMQ 预留；日志目前仅 pino stdout，无采集/下沉与保留策略，监控域立项时应「日志+指标+追踪」三件套统一设计；终态微服务已定（ADR-007）→ 追踪升级为「服务抽取前必备」 | 阶段 B（首次真实流量/监控域立项） | 2026-08-23 |
| e2e 套件级临时数据清理 | 当前以 `global-teardown` 全表 TRUNCATE 兜底 | 兜底失效或套件间数据污染复现 | 2026-08-21 |
| 高级密码策略 | argon2id 成本参数目前是强度底线，无复杂度 / 历史密码检查 | 多用户 / 多端真实接入场景出现 | 2026-08-21 |
| restore 端点 / 超管标志位化 / 单测覆盖率下限棘轮 / 防环 DB 层加固 | 已识别未实施 | 相应主题立项时逐项处置 | 2026-08-21 |
| dept / 监控域后端实现 | 前端 views / api / mock 已就位并降级空态，后端未实现 | 两域业务需求立项（届时 seed 菜单树恢复节点） | 2026-08-21 |
| mine-logs 个人安全日志 | `/api/v1/mine-logs` 仅 mock 供数，后端未实现 | 监控域登录日志立项时统一设计 SecurityLog 数据源 | 2026-08-21 |
| 头像上传与文件存储 | `avatar` 目前为字符串字段（URL 或 null），无上传端点 | 文件存储基建（本地盘 / 对象存储 + 上传端点）引入时 | 2026-08-21 |
| schema.prisma 多文件拆分 | 当前单文件 166 行 / 9 模型健康；业务域扩展（监控 / dept / 文件存储）后单文件将膨胀。Prisma 7 的 `prisma.config.ts` schema 字段支持目录/文件数组（multi-file），全库仅一个 datasource + generator 为硬约束；拆分需一次改齐 prisma.config.ts、prisma 脚本与 Dockerfile COPY 路径（以 7.9.x 官方文档确认目录/数组写法）；现阶段维持单文件并确立「按域分节」书写约定 | 模型数 > ~25 或行数 > ~600 或第二限界上下文立项 | 2026-08-26 |
| test/ e2e 分层 | 当前 test/ 根混放 7 个基建/引导文件（jest 配置、global-setup/teardown、e2e-env、strip-import-meta 等）与域 spec，`helpers/`、`fixtures/` 已分出；dept/monitor e2e 已立项，届时根目录将再堆多个 `*.e2e-spec.ts`（system.e2e-spec 已 20KB）。方案：域 spec 下沉 `test/e2e/<domain>.e2e-spec.ts`，基建留根或收敛 `test/support/`，同步调整 `jest-e2e.cjs` 的 roots/testMatch 与 helpers 相对导入 | 新增第一个非 auth/system 域 e2e（2026-10-05 已命中：iot 域 e2e 落地，暂随现有平铺路径以保持单一结构、不引入双路径并存） | 2026-08-26 |
| module 注册域聚合约定 | `app.module.ts` 9 import 尚健康；防膨胀策略延续 `SystemModule` 聚合模式（域聚合模块包 leaf，app.module 只 import 聚合）；明确拒绝反射/目录扫描式自动注册（破坏 DI 可发现性，与薄壳显式哲学相悖）；全局 `APP_GUARD/APP_FILTER` provider 留组合根 | 域聚合 > ~5 或 app.module import > ~15（可引入 `src/domains/` 物理聚拢） | 2026-08-26 |
| common/ 外部中间件适配器上提 | `common/` 现混放框架约定（guards/filters/decorators/errors 等，纯 NestJS）与外部适配薄壳（redis/logging/throttler）；Prisma 适配器已独立 `database/`，概念缝隙已隐式存在；方案：`redis/`、`logging/`、`throttler/` 随下一个外部适配器一起上提 `src/infra/`，形成「infra = 外部薄壳、common = 框架约定」二分 | **延后**：原判据「本增量要加两个外部适配器」随消费者独立成 `apps/iot-worker` 而失效——server 侧只剩一个薄的 BullMQ 生产者，TDengine 客户端在 worker 侧、不进 server。待 server 侧再落第二个外部适配器时重启评估 | 2026-08-26 |
| CI PR 门禁与分支保护 | CI 现仅入库后验（push master，报警式，ADR-006 刻意决策），团队扩张或 agent 自动提交增多时 master 存在红构建无人拦截；迁移成本低：gate job 增 `pull_request` 触发器 + 开分支保护 | 阶段 E（第二协作者加入或开始接受外部 PR） | 2026-08-26 |
| server 冒烟生产级演进 | 现有形态适配「无 registry / 单 job」现状；演进信号：① 镜像开始 push registry（CD 制品策略落地）→ 冒烟拆独立 job、按 digest 拉取同源产物；② 出现事务性冒烟需求（seed 凭据登录 + 业务读写闭环）→ 探测升级；③ 第二运行时依赖（BullMQ）→ 迁移 compose/Testcontainers | 任一信号出现时立项 | 2026-08-29 |
| 供应链加固 | ① 无 Dependabot/Renovate，依赖更新仅靠 `pnpm audit` 事后报警；② 无镜像内容扫描（Trivy/Grype），基础镜像与 OS 层漏洞无感知；③ GitHub Actions 版本钉 major（`checkout@v4`），企业实践钉 commit SHA——**2026-10-05 实例佐证其必要性**：action 自身的运行时与缓存行为会静默把 job 打红（`setup-node` 的缓存 post 步骤路径校验失败，使 `audit` 报警式 job 失败、整轮 CI 变红，见 [build-and-verify.md](../engineering/build-and-verify.md)）。方案已定（ADR-007）：Renovate 公有 GitHub App（`.renovaterc.json`，需确认 pnpm manager 同管 catalog 与 lockfile）；Trivy 入 CI 报警式（docker-build 加一步 + 漏洞库缓存）；check-digests 季度刷新在 Renovate 落地后退役 | 阶段 A（生产部署试点） | 2026-08-26 |
| CD 制品策略规划 | 无镜像版本 / tag 策略（CI 仅 `multi-admin-*:ci`）、无 registry 选型、无多环境变量矩阵（仅一套 `.env.example`）、未定 secrets 注入路径（GitHub Secrets → 部署目标）；方向已定（ADR-007）：自建 registry（Harbor 类），部署 VM docker 优先、K8s 可选（OCI 镜像兼容两者） | 阶段 E（第二协作者或 CD 立项） | 2026-08-26 |
| system 域只读查询门面 | `auth.service` 直查 system 域表（permissionsOf / getAsyncRoutes / findUserWithRoles 直接 `prisma.role/menu/user`），监控 / dept 域立项后多域直查将使表结构变更影响面发散；方案：抽取 `SystemQueryService` 只读门面，各域统一经门面访问 | 第二个需用户/角色信息的域立项 | 2026-08-26 |
| Prisma 迁移回滚预案 | Prisma 不支持 down 迁移，`migrate deploy` 单向，生产迁移中途失败无回退剧本；方案：破坏性迁移（删列/改类型）提交时附带手写回滚 SQL（migration 注释或独立文件） | 第一次破坏性 schema 变更前 | 2026-08-26 |
| pure-web 上游同步周期评估 | vue-pure-admin template 衍生（接入 2026-08-10），无 fork 跟踪机制；方案：基线 SHA 记录 + ops/upstream-diff.sh 差异报告 + 选择性吸收（吸收项走 strict 迁入 + 测试验收） | 上游大版本发布或季度触发 | 2026-08-29 |
| EMQX 集群的商业授权路径评估 | P1 用 EMQX 6.3.x LTS **单节点**（BSL 1.1 免费额度覆盖）；付费触发点为多节点集群 / 对外托管 / 嵌入转售（记录见 [ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md)）。替代路径未评估：商业订阅形态（年度订阅 + License Key，限额为并发会话数）vs 改用 Apache-2.0 且原生集群的 VerneMQ | 需要多节点集群或高可用时 | 2026-10-02 |
| TDengine 的 AGPL 义务重估 | 时序库选 TDengine 社区版（AGPL-3.0，见 [ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md)）。§13 义务要件为"修改源码 + 对外网络交互"；P1 与内部自用不触发，但**对外提供服务或嵌入转售时须重估**（走商业授权，或按 AGPL 义务设计）。客户端 `@tdengine/websocket` 为 MIT、通信在进程边界外，应用侧不构成衍生 | 产品形态转为对外服务或嵌入转售时 | 2026-10-02 |
| 本地落盘缓冲目录的容量与运维 | 队列不可达时 server 落本地 `IOT_SPILL_DIR`（compose 挂 `server-spill` 卷），但目录无容量上限告警 / 轮转 / 清理策略。⚠️ **溢出后是「停止订阅、完全断流」**：缓冲超 `IOT_SPILL_MAX_BYTES` 后 `TelemetryProducer.send()` 在**尝试入队之前**即返回 `dropped`（`apps/nestjs-server/src/modules/iot/telemetry/telemetry-producer.ts:114`），`overflowed` 置真后**永不复位**，补投成功也不清除（同文件 `:137-142`）⇒ 队列恢复后也不再接收新报文，恢复唯一途径是重启进程；已落盘的存量仍继续补投。这与 [缓冲层](../tasks/archive/2026-10-07-iot-p1-increment-2/2026-10-09-buffer-layer.md)「Redis 恢复后按序补投」只覆盖**已落盘部分**、不覆盖后续新报文。处置流程与容量观测缺位 | 队列 Redis 出现较长时间不可达，或落盘目录接近上限 | 2026-10-10 |
| 遥测写入的规模上限（每子表一条语句） | worker 写入层对每个子表逐条 STMT 语句，P1 规模为 100 设备 × 单测点；子表数随设备 / 测点增长时单批语句数与连接压力未压测，规模拐点未知 | 规模压测（设备 / 测点数量上调）或写入延迟出现抖动 | 2026-10-10 |
| TDengine 真实压缩比与存储容量估算 | 容量按 TDengine 标称压缩比估算，未经真实数据实测；KEEP / DURATION 与降采样保留期（原始 3 年、分钟级 3 年、库级 10 年）同磁盘需求的对照关系未验证 | 存储与归档阶段以真实数据实测，或磁盘容量规划前 | 2026-10-10 |
| 设备档案数据源过渡 | `packages/device-registry` 对消费方仍暴露 P1 静态数据（100 台设备硬编码），PG 四表与 server 只读仓储已落地；消费侧改读档案快照、档案变更后的缓存失效与下发同步、注册写档案未实现 | 消费侧改读档案快照、缓存与下发同步需求出现时 | 2026-11-05 |
| doc-lint ④ 判据与技能母版分叉 | 本仓副本 `scripts/doc-lint.cjs` 检查 ④ 已改为比对文档 frontmatter 的 `last_verified` 与 covers 路径最后变更日（提交时间戳的 UTC 日期），不再比提交时间戳；技能母版 `project-doc-governance` 的 `doc-lint` 仍按提交时间，副本与母版行为分叉，`--version` 只能提示落后、察觉不到行为差异。⚠️ 同批还有一处副本改动：`gitLastCommitDate` 的时区注释（把 `coverDate(UTC) ≤ coverDate(local)` 的论断限定到 UTC 偏移 ≥ 0），母版若仍作普适论断，同步时会一并回退 | 下一次从技能母版同步 / 重组复制 doc-lint 副本时（须先让母版 ④ 采纳同一判据，否则母版会静默回退本仓修复） | 2026-10-13 |
| 降采样环对「未登记原始子表」的整级失败 | 降采样读取是 `PARTITION BY tbname` 扫全量原始超表、**不查注册表**，而写入要求子表已预建 ⇒ 原始库里**只要有一张未登记的子表**（探针遗留，或设备注销后未清子表 / 部分建表），该级的**整次重算就响亮失败**（`Table does not exist`）。**爆炸半径**：**一张未登记原始子表 ⇒ 该级全体设备的数据一起失败**，不只影响涉事设备——设计 §6 的七条失败模式未枚举这一类。本机 `wewant_iot` 曾出现 7 张未登记子表（已清除）。（源：F5 报告 §11） | 原始库出现未登记子表；⚠️ **决策待定**：改设计（读取时按注册表裁剪子表）还是仅在本表登记该失败模式 | 2026-10-13 |
| `@tdengine/websocket` 在 nestjs-server 应列 devDependencies | 该依赖在 `apps/nestjs-server` 内**只被 `apps/nestjs-server/scripts/tdengine-stmt-probe.mjs` 引用、`src/` 零引用**，语义上属 devDependency；现列 `dependencies` 会让 prod 阶段 `pnpm install --prod` 把连接器（及其 `winston` 运行依赖）一并装进生产镜像。改列需同步重生成 `pnpm-lock.yaml`（改 importers 段）。catalog 归属不受影响（仍两处消费）。（源：F9 报告 §九.1） | 生产镜像瘦身 / 依赖清单整理时 | 2026-10-13 |
| CI：三个 job 的 redis 由 `services:` 改步骤容器（已推送，运行结果待核） | GH Actions `services:` 容器不支持 `command`，`--requirepass` 传不进去；已将 `docker-build` / `coverage` / `e2e-web-real` 三 job 的 redis 改为步骤内 `docker run`（带认证），并扩展 `check-digests.sh` 正则覆盖该形态。`docker run` 命令已在本地等价复现（命令、pin、就绪轮询一致），相关变更已随 master 推送执行；当前 master CI 连续失败，需先定位红因再核该步骤。（源：F12 报告 §9.1） | 定位 master CI 连续失败的红因时，先看三 job 的 redis 启动与就绪 | 2026-10-13 |
| CI：coverage job 新增 iot-worker e2e 步骤（已推送，运行结果待核） | `coverage` job 新增 `pnpm --filter @multi-admin/iot-worker run test:e2e` 步骤（依赖该 job 的 redis-queue / tdengine service）；本地以相同前置通过，相关变更已随 master 推送执行；当前 master CI 连续失败，需先定位红因。已按 `continue-on-error` 保守处理（失败不打红该 job，也不主动报警）。（源：F8 报告 §关注点 1） | 定位 master CI 连续失败的红因时查 coverage job 该步骤结果（报警式不拦截，红了须人工看） | 2026-10-13 |
| `failure.ts` 的 A/B 错误码表标定于单一 TDengine 版本 | `apps/iot-worker/src/failure.ts` 的 A/B 分类（错误码 + 报文形态）标定于本机 `@tdengine/websocket` 3.5.0 → 服务端 3.4.2.8；服务端 / 连接器版本升级若改了码值或报文，分类可能失灵（缓解：判不出时默认归 A 类，宁可重投不丢）。（源：F3a 报告 §四.2） | TDengine 服务端或连接器版本升级时 | 2026-10-13 |
| 读超时（`0x80000019` / `105`）分支未经真实故障注入 | A 类里「读超时可能已成功 ⇒ 必须重试不能丢弃」这条分支**未在真机复现**（约 900 s 级读超时，本地不现实）；现由连接器超时码 `105` 与文档 `0x80000019` 覆盖，单测断言的是码表本身而非一次真实超时。（源：F3 报告 §八.3） | 具备故障注入（发完包后丢包）或可调服务端 `queryTimeout` 的环境时 | 2026-10-13 |
| 本地缓冲两处并发残留 | ① `apps/nestjs-server/src/modules/iot/telemetry/telemetry-spill.ts` 的 `drain` **初始快照读仍在临界区外**（单条 NDJSON 行一次 append 写入，撕裂读风险低）；收尾重读在锁内，才是「不丢」的关键那一步；② `TelemetrySpill` **自身不设 drain×drain 守卫**，靠生产侧 `producer.draining` 保证。（源：F2 报告 §遗留） | 缓冲层并发路径变更、或出现多 drain / 跨实例的新用法时 | 2026-10-13 |
| 消费端 Worker 无 `stalledInterval` / `lockDuration` 配置口子 | 判据③「强杀重投不丢」的 e2e 时长约 61 s，绑死于 BullMQ 默认 `lockDuration/stalledInterval=30s`；缩短会引入「仅测试用的生产配置」，故未动。（源：F8 报告 §关注点 2） | CI 时长成为问题时（给消费端 Worker 加该配置口子） | 2026-10-13 |
| 失败告警的逐 job 噪声 | 一批失败时 `flushOnce` 出**一条** `fatal`（带提级标记），而 `worker.on('failed')` 对**每个 job** 各出一条 `error` ⇒ 一批 N 条 job 会有 N 条 error（沿用既有逐 job 日志形态）。（源：F3 报告 §八.4） | 大批量失败时日志噪声成为运维问题时收敛 | 2026-10-13 |
| 写入器：以「省略 tags 的形态② + STMT2」换回单次 exec 跨子表 | 现写入器走「不带 `USING`、写死子表名」的 STMT1（决策 2 §9）——缺子表报错（防线成立），代价是**每个子表一条语句**、拿不到决策 2 §10 N1 的 5.5×。N2 形态② 探针（§10 N10 / N11，2026-10-13）实测：**字面形态（带 tags）缺子表会静默建表**（与 `USING` 同病，不可用）；**省略 tags 的子形态**（`INSERT INTO <stb> (tbname, ts, …)` + 子表预建）缺表**报错**、且**一次 exec 跨 100 子表**——但**只在 STMT2 路径成立**（写入器强制的 STMT1 上形态② 在 `bind` 即 `512 Invalid operation`）。⇒ 要兼得须放弃 STMT1 强制、改用 STMT2 + 省略 tags。⚠️ **换路径会把缺表报错从 `9731 Table does not exist` 换成 `560 Stmt cache error`**——该码**未登记进 `apps/iot-worker/src/failure.ts`**（`RETRYABLE_CODES` / `UNRECOVERABLE_CODES` / `TABLE_MISSING_CODES` 都没有 `560`，报文 `Stmt cache error` 也不匹配任何 pattern），按现分类会落进 `basis: 'default'`、判成 **A 类可重试且不提级**——与今天（`9731` ⇒ B 类 + 提级告警）**相反**：**缺子表会被无限重投而不是响亮失败**。⇒ 采用该候选**必须先给 `failure.ts` 补 `560`**（或重定它的 A/B 归类），否则等于把「漏建表」从快速失败变成静默重投。（源：F11 报告） | 十万级规模下"每子表一条语句"成为写入瓶颈时（届时连同换 STMT2 路径、换报错码一起评估） | 2026-10-13 |
| 写入器 `SLOT_FAILURE_LIMIT` 计数含 B 类（平台侧确定性）失败 | `apps/iot-worker/src/tdengine/writer.ts` 的连续失败计数把 B 类一并计入——命名 bug 之类反复报 `Table does not exist` 的系统错误，在轮转下最终会作废一条**健康**连接。当前无害且有界（该批已失败并 park，恢复正是此计数的作用），故不改。（源：数据链路阶段终审复审） | 「只作废失败的那一条、仅连接级」须从**消费级口径**升为**写入器级字面不变式**时（改为只计「连接可能真的半开」的错误） | 2026-10-14 |
| 订阅端逐条入队 | `telemetry-producer.ts:116` 每条报文一次 `queue.add`，无批量；10k msg/s 即 10k 次 Redis round-trip/s | 端到端规模压测显示订阅端 CPU 或队列 Redis QPS 成为瓶颈时（先有压测数据，再改批量） | 2026-10-31 |
| `flushChain` 无失败分支（静默停摆） | `consumer.ts:225` 用 `.then()` 而非 `then(f, f)`；`flushOnce` 的写入包在 try 内，但 `dedupeInBatch`（`:237`）在 try 之外。一旦前置段抛出，链永久 rejected，之后所有 `scheduleFlush` 都不再执行 flush——表现为**队列持续积压而没有任何 job 失败** | 任何向 `flushOnce` 前置段新增可能抛错逻辑的改动提交时；或出现「队列积压但 failed 计数为 0」 | 2026-10-31 |
| 子表只增不减 | `wewant_iot` 现 100 张原始子表、`wewant_iot_ds` 300 张降采样子表，均与注册表对齐（`subtable:audit` 可核；e2e 已自清残留）。注销不收回子表与数据：数据按 KEEP 自然过期（原始 1095 天 / 降采样 3650 天）、表永久保留；子表数决定「每子表一条语句」的单批语句数与降采样 `PARTITION BY tbname` 的扫描面，并抬高「未登记子表 ⇒ 整级失败」的命中概率。**孤儿已有回收路径**：`subtable:cleanup`（dry-run 默认、四条闸含 10 分钟新表保护期、原始优先），数据仍按 KEEP 保留 | 子表数接近万级、影响写入与降采样时；或退役设备规模使快照与子表数成为负担 | 2026-10-31 |
| 窗口内单位变更无护栏 | 聚合若区分不出单位，某测点在窗口内换单位会让聚合值跨单位相加、数值无意义且不报错 | 已关闭：单位在模型内不可变；单位不进存储列（载荷 `unit` 只用于与模型声明比对） | 2026-10-31 |
| 备份与恢复无自动化 | 决策 4 只做了 `taosdump` 往返**探针**（`scripts/probe/taosdump-roundtrip.sh`），无定时备份、无保留份数、无恢复剧本与演练记录 | 正式环境存真实数据之前；或首次需要按时间点恢复 | 2026-10-31 |
| 降采样 1h / 1d 无数据级对账 | 判据②只对 `p1_1m` 逐条对账；1h / 1d 仅断言「存在且非空」，正确性依赖与 1m 同一套 level / query / rows 代码路径，**未经数据级验证**（两级窗口内没有原始数据，对账比较了 0 组） | 首次存在完整 1h / 1d 窗口的真实数据时跑一次扩充对账；或两级聚合口径发生改动时 | 2026-10-31 |
| worker 单实例 + 降采样同进程 | 消费与降采样在同一进程、且只有一份实例：停机期间队列积压、降采样停摆，超过 K×窗口的部分永久缺失；扩缩时每实例各开 2 条 TDengine 连接，受服务端会话上限约束（实测 `0x80000022 rpc too many session`） | 需要多实例 / SLA 时；或首次出现「降采样停了数小时无人发现」 | 2026-10-31 |
| 告警无接收方 | 全链路的「告警」都是 pino 日志（订阅端身份拦截、写入失败提级、缓冲溢出、job failed、降采样失败），无任何接收方（邮件 / IM / webhook / 值班）；日志不被主动查看时等于没有告警 | 正式环境上线前；或需要有人按告警响应时 | 2026-10-31 |
| 设备无下行通道 | 决策 3 定为只上行：平台无法远程校时、改上报频率、改配置、触发重注册；错钟设备只能靠拒收兜住（见「设备上报时间戳无边界」） | 需要远程校时 / 配置下发 / 设备重注册时（物模型阶段或现场运维需求） | 2026-10-31 |
| MQTT 无认证 / 无 TLS | EMQX 1883 无认证、只绑回环；任何能连到 1883 的进程都能冒充设备上报或订阅；无 TLS 则无法跨不可信网段 | 开发网段变为不可信（公共 / 共享办公网）、或任何非回环暴露之前 | 2026-10-31 |
| 全链路规模压测缺失 | 只在 100 设备 × 1 条/s 下跑过；`INGEST_CONCURRENCY` / `INGEST_BATCH_SIZE` / 每子表一条语句 / 订阅端逐条入队 / TDengine 会话上限之间的拐点全部未测 | 设备数上调到千级之前；或看板 / 实时查询开始依赖该链路 | 2026-10-31 |
| 降采样 K 自愈边界无缺口检测 | 环只重算最近 K 个已闭合窗口（默认 3）⇒ 晚到或停机超过 K×窗口的部分**永久缺失且不报错**（1m 3 分钟 / 1h 3 小时 / 1d 3 天）；当前没有任何机制发现「聚合少了一段」 | 出现「库里缺几分钟 / 几小时聚合但日志无错」时；或现场补传窗口大于 K 时（届时加缺口检测或改链式） | 2026-10-31 |
| 测点集合未经效率指标倒推 | 数据链路阶段决策卡附录 A 轴 8 判「未完成」：模拟器三测点（温度 / 振动 / 电流）属**设备健康**类，而「效率提升」要的是运行状态 / 产量 / 良率 / 能耗 / 节拍；schema、子表命名、类型分档均已冻结，但测点集合不是从任何效率指标倒推出来的。物模型的属性清单就是这份集合——没有它，单位、量程、类型档位只能继续沿用模拟器三测点。⚠️ 现在改最便宜：尚未接真实设备、尚无历史数据 | 物模型阶段立项前；或第一台真实设备接入前（先定第一个要支撑的效率指标，如设备运行率，再复核测点集合） | 2026-10-31 |
| 测点列类型分档的清单复核 | 分档规则已定（累计量 `DOUBLE` / `BIGINT`、瞬时量 `FLOAT` / `INT`、状态 `BOOL`，见 `2026-10-07-decision-1-schema.md` §6.3 / §6.4），但 P1 清单只有模拟器三个瞬时量、全 `FLOAT`；生产里累计量是常客（电表 / 流量计 / 产量计数），而 `FLOAT` 只有 6–7 位有效数字。**类型不可逆**，上线后再改要迁数据 | 物模型定型时，用真实指标清单过一遍分档规则 | 2026-10-31 |
| 契约 `value` 不支持非数值测点 | `packages/contracts` 上行载荷为 `value: number`；真实设备有 `BOOL` / 枚举 / 文本测点。P1 可以只管数值，但这是落在设备侧（契约）的约定，改动要设备固件配合；物模型定义测点类型系统时回避不了 | 物模型定义测点类型时；或出现开关量 / 枚举 / 文本测点 | 2026-10-31 |
| 标准单位换算时机未定（写时转 vs 读时转） | 载荷带 `unit`，方向已定「采集上来要做一次归一化转换」，但「写时转还是读时转」仍是开口（数据链路阶段决策卡轴 4）；标准单位与换算的归属定在物模型层。它决定原始表里存的是不是标准单位，也决定「窗口内单位变更无护栏」能否在写入侧被发现——两条是同一口径的两面 | 已被单位换算决策关闭：写时不转换（单位与模型声明不符即拒绝）、展示单位在读时换算，收口时移入「已关闭」 | 2026-10-31 |
| 设备类型注册 → 建超表无流程归属 | 超表是存储层的「设备类型」，物模型是应用层的「设备类型」，两者不自动同步；自动建表只建子表，超表必须预先存在 ⇒ 需要「类型注册 → 建超表」流程，归属物模型阶段，当前决策未写谁做（责任人缺口）。数据链路阶段的建表脚本（`tdengine-init.ts`）是该流程的原型 | 设备注册 / 物模型阶段立项时；或设备类型到两位数、第一次设备换型 | 2026-10-31 |
| 「会变」维度的记录方式未定（位置 / 产线） | P1 无位置 / 产线概念，且它们是**会变**的维度：会变且要答案「当时」的维度，必须在它第一次变之前就记——只进标签不够，需普通列（行级固化）或一张变更历史表。是否进标签、以哪种形态记，需在设备档案设计时一并定 | 物模型阶段设计设备档案时；或第一台真实设备接入前（P1 设备由模拟器生成，无真实产线归属，尚无历史可丢） | 2026-10-31 |
| 结构体内部字段需要被筛选或聚合 | 物模型阶段定结构体序列化为 `VARCHAR` 存一列，内部字段不可查询、不可聚合；列名一旦固化无法改造，只能在模型内新增标量属性补一份（旧列停写、不删）。这是「整体读写」口径下的取舍，但现场一旦出现按子字段过滤的需求，没有平滑路径 | 出现按结构体内部字段过滤或聚合的查询时 | 2026-11-03 |
| 审计对「整个模型退场」静默 | `apps/iot-worker/src/subtables/audit.ts:69-85` 按**期望集里出现过的模型编码**建两张超表名集合，只归类命中这两张集合的表：一个模型从档案里整体退场后，它的超表与全部子表**两张集合都不命中 ⇒ 整片被跳过**，四桶全空、审计报通过。「表存在 ⇔ 曾注册」对「模型整体退场」这一类不成立。初始基线只有一个模型且档案是编译期常量，碰不到；超表名改由档案推导后，洞的口径随模型数增长 | 审计期望集改由只读仓储的 `listSubtablesOfRegisteredDevices()` 提供时（消费侧接线）；或第一个模型被整体退场时 | 2026-11-05 |
| 已知 key 收到非数值时静默丢弃 | `apps/iot-worker/src/detection.ts:120` 的 `isFiniteNumber` 不通过即 `continue`：既不计入 `unknownMetricKeys`、也不告警。设备把 `temperature` 报成字符串或布尔时，该测点无声消失，与"根本没上报"不可区分。契约已允许非数值，但落库仍需消费侧按模型声明建列 | 消费侧接入（检测改由模型声明类型驱动时一并给原因码） | 2026-11-04 |
| 在线变更表结构的锁与耗时未标定 | 测试 / 生产环境不允许重建库（档案里已有用户录入的数据），表结构变更只能走 `ADD COLUMN`（物模型与 DDL 归属决策）。TDengine 的 `ADD COLUMN` 在已有数据的大表上是否锁写、耗时多少，本机未实测——它决定变更是否需要停机窗口 | 测试环境首次需要在线变更表结构时；或单表数据量超过千万行 | 2026-11-05 |
| e2e 与迁移路径不得假设库可重建 | 开发环境靠 `down -v` + 补齐脚本重置，测试 / 生产不行。后续 e2e、对账脚本、迁移脚本都必须做到"自清理、不重建"；任何需要清库才能通过的用例都是债 | 测试环境接入第一台真实设备档案之前 | 2026-11-05 |
| pure-web 残留未使用的 `mqtt` 4.3.7 | `apps/pure-web/package.json` 声明 `mqtt` 4.3.7，源码无 import；catalog 主版本为 5.x，同一仓库两个大版本并存 | 前端依赖清单整理或下一轮依赖升级时 | 2026-11-08 |

## 已关闭

| 项 | 背景 | 触发条件 | 处置方式 | 关闭日期 | 登记日期 |
|---|---|---|---|---|---|
| 生产安全基线加固 | ① Dockerfile 无 `USER` 指令容器以 root 运行；② `node:24-alpine`/`postgres:15-alpine`/`redis:7-alpine` 无 digest pin（不可复现构建）；③ 请求体大小依赖 Express 默认 100kb 未显式声明 | 生产部署前 | ①② 非 root + digest pin 落地（见 docs/tasks/archive/2026-08-27-server-security-baseline/）；③ BODY_LIMIT / UPLOAD_BODY_LIMIT env 可配置，全局 1mb + 上传路由 10mb | ①② 2026-08-28；③ 2026-08-27 | 2026-08-23 |
| 登录限流账号维度与失败锁定 | 登录端点限流仅 IP 维度（5/min/IP），无按 username 的失败计数/临时锁定，分布式爆破与共享出口 IP 误伤两类风险均未覆盖 | 公网暴露或真实多用户接入 | 账号维度失败计数 + 15 分钟临时锁定，LoginLockGuard 前置 + 混合错误语义 42301 | 2026-08-27 | 2026-08-23 |
| 依赖漏洞扫描 | `pnpm check` 门禁无 audit 环节，供应链风险无感知 | 生产部署前或 CI 落地时 | CI `audit` job：`pnpm audit --audit-level=high` 报警式，收紧复盘见供应链加固记录 | 2026-08-25 | 2026-08-23 |
| 校验错误字段级明细 | ValidationPipe 字段错误被全局过滤器折叠为固定文案「参数校验失败」（resolveException 对 BadRequestException 丢明细）；信封 data 可扩展 errors 数组 | 前端联调体验优化 | exceptionFactory 递归展开 `{ field, message }[]` 经 data.errors 返回，含嵌套 DTO 点分路径 | 2026-08-27 | 2026-08-23 |
| Prisma 慢查询日志与连接池显式配置 | PrismaClient 无 log 配置（无慢查询观测，错误直打 stderr 不走 pino）；PrismaPg 无显式连接池 max（pg 默认 10）。方案：`log: [{ level: 'query', emit: 'event' }]` + `$on('query')` 按 duration 阈值过滤后转投 nestjs-pino（携带 requestId，与请求链关联）；带 `PRISMA_QUERY_LOG` env 运行时开关供生产临时排障（看具体 SQL + 参数，排障窗口期开启、事后关闭）；配套 postgres 侧 `log_min_duration_statement` 常态兜慢查询 | 生产上线或压测 | `$on('query')` 阈值 warn + 全量日志开关 + 连接池 max 显式配置；慢/全量文案已区分 | 2026-08-27 | 2026-08-23 |
| CI/CD 落地 | 质量门禁仅本地 `pnpm check` + husky，无自动化构建/扫描/镜像发布；AGENTS.md 明示无 CI 现状 | 用户决策引入 CI 基础设施 | `.github/workflows/ci.yml` 四 job 异步安全网，ADR-006 | 2026-08-25 | 2026-08-23 |
| electron-desktop prebuild 构建链 | `prebuild` 直接调 pure-web build 但未先构建 contracts 包，干净工作区首次 `build:desktop` 会因 `dist/` 不存在而断链 | electron-desktop 构建链路改造或 contracts 第二个消费者出现时补 `prebuild` 钩子 | turbo 任务图取代钩子编排，ADR-005 | 2026-08-23 | 2026-08-21 |
| contracts 包缺 lint / format 脚本 | `packages/contracts` 仅有 build / typecheck / test，无独立 lint 与 format 校验 | contracts 消费者增至 2 个以上时补齐 | 补齐 lint / format 脚本与 eslint 薄壳，turbo 迁移任务 | 2026-08-23 | 2026-08-21 |
| server 镜像启动冒烟 | docker-build job 仅 web 镜像有启动冒烟（curl 200 重试），server 镜像只构建不运行，entrypoint 链（migrate → seed → node）问题构建期不可见；可复用 coverage job 的 postgres/redis service 模式加 compose 式 `/health` 探测 | server 镜像首次进入真实部署链路前 | docker-build job 加 postgres/redis services（digest pin 沿用安全基线）+ /health 探针冒烟，server-smoke.sh 本地/CI 同源；check-digests 计数边界 8 → 10 | 2026-08-29 | 2026-08-26 |
| BODY_LIMIT / UPLOAD_BODY_LIMIT 格式正则校验 | 曾考虑在 env.schema 对 body limit 字符串加格式正则拦截无效配置；结论：express 启动时对非法 limit 已 fail-fast 抛错（`option limit "x" is invalid`），正则收益仅报错文案且有误拒合法格式（如 1.5mb）风险 | 配置错误导致启动报错信息确实引起运维困扰时再评估 | 不实施 | 2026-08-27 | 2026-08-27 |
| pure-web 遗留组件处置 | 24 个组件目录中 8 个零引用（ReBarcode/ReFlop/ReSeamlessScroll/ReSelector/ReSplitPane/ReTreeLine/ReCropper/ReVxeTableBar），pure-admin 遗留资产；ReDrawer 经组件盘点实测有 1 处 App.vue 引用，已转在用并纳入组件测试（豁免清单条目随之移出）；本任务只盘点豁免不删除，删除决策为 ReCropper 转在用、其余 7 个删除，随前端测试收口批次执行 | 随前端测试收口批次执行 | 收口批次删除七个零引用组件，ReCropper 转在用随后续批次迁入 | 2026-09-01 | 2026-08-29 |
| pure-web 测试基建与 strict 类型安全 | pure-web 零测试且为全仓唯一 `strict: false` 端，总体设计已定稿（双 tsconfig 分层 + vitest 基建 + 模块级 ≥80% 覆盖） | 本任务立项执行中 | 前端测试收口批次全部 13 项任务完成：963 单测 / 122 文件 / 9 E2E / strict 全量迁入单一 tsconfig；结论 → [build-and-verify.md](../engineering/build-and-verify.md)；归档 → [archive/2026-08-29-pure-web-testing-foundation/](../tasks/archive/2026-08-29-pure-web-testing-foundation/) | 2026-09-02 | 2026-08-29 |
| pure-web E2E 测试基建 | 组件级测试完成后仍缺登录 → 动态路由全链路浏览器级回归 | 已决策纳入 | Playwright 基建落地，9 E2E 用例（登录全链路 + 关键页面冒烟）通过；结论 → [build-and-verify.md](../engineering/build-and-verify.md) | 2026-09-02 | 2026-08-29 |
| pure-web strict 迁移最终态收口 | 双 tsconfig + 清单断言 + pre-commit 拦截均为迁移期机制，存量全部迁入后须一次性收口 | 随前端测试收口批次执行 | tsconfig.json extends @multi-admin/tsconfig/web.json（strict:true 直承）；删除 tsconfig.strict.json / exemptions / assert-strict-manifest.mjs / check-strict-web.mjs；check.mjs 与 husky 移除断言阶段 | 2026-09-02 | 2026-08-29 |
| print.ts strict+覆盖补全 | `utils/print.ts` DOM 打印模块 strict 修复 + 覆盖率门槛 | 随前端测试收口批次执行 | strict 部分已随前端测试收口批次清零迁入；覆盖口径维持（jsdom 不可达 API 豁免） | 2026-09-02 | 2026-08-29 |
| Canvas 绘制豁免回补 | 三类 Canvas 行为 jsdom 不可达，采用薄测试 + 豁免清单口径 | 随前端测试收口批次 E2E 回补 | E2E 覆盖验证码/二维码/打印行为级；cropper 深度交互维持永久豁免 | 2026-09-02 | 2026-08-30 |
| vitest 配置未来兼容 | vitest.config.ts 触发 Vite 未来版本告警 + check-strict-web.mjs DEP0190 告警 | 随前端测试收口批次修复 | 该批次已修复 vitest.config.ts 告警（扩展名 + JSON import attributes）；check-strict-web.mjs 已随收口批次删除（DEP0190 不再适用） | 2026-09-02 | 2026-08-30 |
| doc-lint 接入门禁链 | doc-lint 副本（scripts/doc-lint.cjs）已落仓库并登记 AGENTS.md，但依赖文档变更后自觉执行，孤儿/死链/漂移缺机械保障；当前基线全绿接入成本低 | 下一次文档体系维护或治理任务（候选方案：pnpm check 链加步 / ops:pre-push 加步 / CI 报警式 job） | 双层门禁：`ops:pre-push` 加 doc-lint 步（阻断）+ CI 独立 doc-lint job（报警式）+ `pnpm doc:lint` 入口；前置清项 2 漂移（backend-evolution.md 移除动态 covers、repo-structure.md 刷新） | 2026-09-05 | 2026-09-04 |
| 降采样对账脚本的「空过」 | `apps/iot-worker/scripts/downsample-verify.ts` 按**墙上时钟**取要比的窗口；流量已停时它比较 **0 组** `(子表, 窗口)` 与 0 行降采样，结论仍是「差异 0 处 · ✔ 对账通过」。判据②要的是「逐条对账」，而 0 组对账不是证据——正是设计里警告的「又一次看起来通过」。（源：数据链路阶段验收实测——首次运行比较 0 组即打绿，起流量后才变成 200 组真对账） | 判据②再次以脚本结论作为验收证据前 | 两侧计数任一为 0 即判失败并打印「空对账不构成证据」，无 `--allow-empty` 逃生口；复算历史段用 `--now <数据最后时间戳>` | 2026-11-02 | 2026-10-31 |
| worker 无健康检查 | `docker-compose.yml` 的 `worker` 只有 `restart: unless-stopped`，无 `healthcheck`（`server` 有）：worker 卡死但未退出时容器状态仍是 running，`restart` 不会触发 | worker 进入正式部署（compose 托管或 K8s）之前 | 进程每 10 s 写心跳键 `wewant:worker:hb:<容器主机名>`（TTL 30 s），compose healthcheck 跑 `node dist/healthcheck.js` 读键；反映事件环停摆与队列 Redis 不可达，unhealthy 不自动重启（可见信号，为 K8s liveness 铺路） | 2026-11-02 | 2026-10-31 |
| iot-worker e2e 写生产形态原始表且不清理 | `apps/iot-worker/test/consumer.e2e.ts` 的两条用例都以 `Date.now()` 为基准、向 `wewant_iot.telemetry`（`sim-001` 子表）各写 3 行，`finally` 仅 `obliterate` 队列、**不删除**这些行；同目录 `consumer-kill.e2e.ts` 与三个降采样 e2e 都在 `finally` 删除自己造的行。后果：每跑一次 `pnpm --filter @multi-admin/iot-worker run test:e2e`，本地开发库多 6 行"形似真设备"的遥测（CI 用一次性 TDengine service，无累积）；反复跑单调增长，且若恰在窗口边界附近跑、叠加正在运行的降采样环，对应窗口会多出非设备来源的行。（源：F10 复验——跑一次 e2e 套件后原始表 +6 行） | 本地反复跑 iot-worker e2e 使开发库膨胀，或 e2e 与降采样环同跑出现窗口混淆时 | 两条用例在 `finally` 删除自己写入的原始行（按 `ts` 区间）与三级降采样窗口行（`1m` / `1h` / `1d`）；跑一次 e2e 前后 `sim-001` 子表与三级降采样表的行数完全一致（raw 4654 / 1m 69 / 1h 4 / 1d 3） | 2026-11-02 | 2026-10-13 |
| 设备档案缺协议版本字段 | 协议版本允许 3.1.1 / 5.0 混用（数据链路阶段协议决策），「混用可见性」的最小落地是把接入设备的协议版本记进设备档案；PG 的 `IotDevice.protocolVersion` 已就位，`packages/device-registry` 的 `DeviceRecord` 仍无此字段 | 注册写档案时 | 注册接口接收可选的 `protocolVersion` 并写入 `IotDevice.protocolVersion`；`DeviceRecord` 保持档案读模型的形状，注册写入不经过它 | 2026-11-06 | 2026-11-05 |
| 模型编码未经校验直接拼进 DDL | `apps/iot-worker/src/schema.ts` 的四个建表函数把 `modelCode` 直接插进 DDL；DDL 归属移到 server 后，建表路径必须只用已校验的输入 | 注册路径开工时 | 注册路径的 DDL 全部由已过 `validateModel` / `checkModelCode` 的声明生成；设备注册先校验并归一化 `modelCode`，DDL 层不再接受未校验输入 | 2026-11-06 | 2026-11-04 |
| 设备上报时间戳无边界 | `apps/iot-worker/src/detection.ts` 只校验 `isFiniteNumber(ts)`：错钟或未来时间戳的数据会落进错误窗口；若落在降采样 K 之外，**永远不会被聚合**且不报错；远期 `ts` 还会污染按时间范围的查询 | 已被时间戳边界决策关闭，随后落地 | worker 消费环在 `parseEnvelope` 之后、`resolvePoint` 之前按 `INGEST_TS_MAX_FUTURE_MS`（默认 +24 h）/ `INGEST_TS_MAX_PAST_MS`（默认 −90 d）拒收，闭区间、独立计数 `clockOutOfRange`，日志按秒聚合 | 2026-11-07 | 2026-10-31 |
| 报文大小无上限 | 订阅端不校验 MQTT payload 字节数，直接 `queue.add`；进队列的最大报文由 EMQX 的报文上限决定，订阅端自身无护栏 | 已被报文上限决策关闭，随后落地 | `TelemetryProducer.send()` 第一行按 `Buffer.byteLength` 对比 `IOT_MAX_MESSAGE_BYTES`（默认 256 KiB），超限返回独立去向 `oversized`、不入队也不落盘；EMQX 默认 1 MB 保持硬顶，超限日志按秒限频 | 2026-11-07 | 2026-10-31 |
| 批内同键不同值的行为 | `dedupeInBatch` 按 `(子表, ts)` 保留**最后一条**；同一毫秒两条不同值时前一条的值静默丢弃，只体现在 `duplicateInBatch` 计数 | 物模型 / 测点重定义立项时定冲突处置 | 维持 last-wins：同一 `(子表, ts)` 的最后一条胜出，是幂等语义、与 TDengine 覆盖语义一致；`duplicateInBatch` 计数保留作为可观测的量，不新增告警（告警接收方缺位） | 2026-11-07 | 2026-10-31 |

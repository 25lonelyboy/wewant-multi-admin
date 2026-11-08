# AGENTS.md

This file provides guidance to AI Agents when working with code in this application.

## 应用定位

`apps/iot-worker` 是遥测消费者，与 HTTP 服务**并列的第二个运行时**：不用 Nest、不开 HTTP，从 BullMQ 队列取原始报文，按业务 Redis 的档案快照解析 / 过滤 / 攒批后写入 TDengine。可独立启停、多实例、扩缩；**不碰 PostgreSQL**，容器无 migrate / seed。

仓库级命令与协作约定见 [commands-and-conventions.md](../../docs/engineering/commands-and-conventions.md)，架构事实见 [backend.md](../../docs/architecture/backend.md)。

## 常用命令

```bash
pnpm --filter @multi-admin/iot-worker run dev              # tsx watch
pnpm --filter @multi-admin/iot-worker run build            # tsc → dist/
pnpm --filter @multi-admin/iot-worker run start            # node dist/index.js
pnpm --filter @multi-admin/iot-worker run lint             # eslint --max-warnings 0
pnpm --filter @multi-admin/iot-worker run typecheck        # tsc --noEmit
pnpm --filter @multi-admin/iot-worker run test             # node --test（单测）
pnpm --filter @multi-admin/iot-worker run test:e2e         # 串行 e2e，需真实队列与 TDengine
pnpm --filter @multi-admin/iot-worker run test:coverage    # 行 ≥90 / 函数 ≥85 / 分支 ≥80
pnpm --filter @multi-admin/iot-worker run tdengine:init    # 建库 / 超表 / 子表（幂等）
pnpm --filter @multi-admin/iot-worker run downsample:verify
pnpm --filter @multi-admin/iot-worker run subtable:audit
pnpm --filter @multi-admin/iot-worker run subtable:cleanup # 缺省 dry-run
```

本地整体前置：`pnpm ops:env-up`（队列 Redis、业务 Redis、TDengine）。e2e 另需导出**宿主可达**的业务 `REDIS_URL`。

## 架构要点

- **启动顺序**：`index.ts` 先 `snapshot.start()`，拉不到快照就退避重试，不启动消费环与降采样环。空快照会把数据全部当 `unknown-device` 丢掉。
- **消费环**：BullMQ 消费 `iot-telemetry-ingest`；`INGEST_CONCURRENCY` 同时是一批最多攒多少条，攒够 `INGEST_BATCH_SIZE` 或到 `INGEST_FLUSH_INTERVAL_MS` 即 flush。
- **入库成功才 ack**：写入失败或 `getLastAffected()` 合计少于提交行数都整批 reject；批内先按 `(子表, ts)` 去重。
- **失败分类**：连接 / 超时归可重试类，原样抛回队列；格式 / 权限 / 表结构归不可重试类，抛 `UnrecoverableError` 进 failed 集合并告警。`Table does not exist` 提级告警。
- **快照**：每 `REGISTRY_POLL_MS` 读 `iot:registry:built`，版本不同即拉全量并整份替换档案与模型；超过 `REGISTRY_STALE_ALERT_MS` 升为 error。
- **写入**：TDengine 连接池 `TDENGINE_CONNECTIONS`（2~4）轮转分发；每条子表一条 STMT 语句，缺表会报错而不是静默建表。
- **降采样环**：与消费环并列，BullMQ Job Scheduler 触发；每次重算最近 `DOWNSAMPLE_LOOKBACK_WINDOWS` 个已闭合窗口；三级 `1m` / `1h` / `1d` 平级，业务日从 08:00 起；只有 leader 持有环，锁在队列 Redis。
- **健康探针**：每 10 s 写 `wewant:worker:hb:<hostname>`（TTL 30 s），`dist/healthcheck.js` 读键；只反映事件环停摆与队列 Redis 不可达，不反映消费进度。

## 硬规则

- **跨应用队列名必须在 contracts**：`iot-telemetry-ingest` 与键前缀 `wewant` 来自 `packages/contracts`；本应用内的降采样队列就地定义，不进 contracts。
- **通信格式**：相对导入带 `.js` 后缀；ESM。
- **时间戳边界**：`INGEST_TS_MAX_FUTURE_MS`（默认 +24 h）/ `INGEST_TS_MAX_PAST_MS`（默认 −90 d）在查档之前拒收，闭区间，独立计数。
- **清理脚本闸门**：`subtable:cleanup` 缺省 dry-run；快照缺失、期望集为空、快照不新鲜、新表保护期内都拒绝或跳过删除。
- **优雅停机**：SIGINT / SIGTERM 先落库再关闭消费环、降采样环、心跳与快照，最后 `destroyTd()`。
- **env 单点声明**：所有变量在 `src/config.ts` 的 zod schema 中声明，校验失败启动即崩；完整默认值见该文件与根 `.env.example`。

## 文档导航

- 架构事实：[iot-worker.md](../../docs/architecture/iot-worker.md)（消费链路、快照、降采样、失败分类）
- 设备契约：[contracts.md](../../docs/architecture/contracts.md)（主题、载荷、队列名）
- 工程实践：[build-and-verify.md](../../docs/engineering/build-and-verify.md)（测试、覆盖率、清理脚本闸门）
- 待处置项：[backlog.md](../../docs/governance/backlog.md)

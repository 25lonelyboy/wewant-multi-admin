---
status: living
covers:
  - scripts/ops/
  - scripts/probe/
  - apps/nestjs-server/scripts/
  - apps/iot-simulator/scripts/
last_verified: 2026-11-08
---

# ops 脚本与验证探针

本地高频操作沉淀为可复用脚本，人和 Agent 均可调用。ESM 脚本复用 `@multi-admin/node-utils`，Shell 脚本统一 `#!/usr/bin/env bash` + `set -euo pipefail`。部署与 compose 见 [deployment.md](deployment.md)。

## ops 自动化脚本

| 命令 | 脚本 | 职责 |
|---|---|---|
| `pnpm ops:pre-push` | `pre-push.mjs` | push 前 CI 同构校验：frozen-lockfile + check + doc-lint + audit |
| `pnpm ops:ci` | `ci-status.sh` | CI 结果拉取：最近 5 次 run 状态 + 失败自动打印日志 |
| `pnpm ops:ci-logs` | `ci-logs.sh` | CI 失败日志导出：`.ci-failure-<id>.log`（Agent 可读取分析） |
| `pnpm ops:env-up` | `env-up.sh` | 开发环境启动：postgres + redis + redis-queue + emqx + tdengine + migrate + 构建依赖 + seed + tdengine:init |
| `pnpm ops:env-down` | `env-down.sh` | 开发环境停止（`--clean` 清除数据卷） |
| `pnpm ops:tdengine-init` | 转发到 turbo `tdengine:init`（`dependsOn: ^build` + `apps/iot-worker/scripts/tdengine-init.ts`） | 先构建 contracts / device-registry，再建 TDengine 库 / 超表 / 子表 / 降采样子表，并清理遗留的降采样流（幂等，可反复执行；只建不删库）；`ops:env-up` 已串 |
| `pnpm ops:smoke` | `docker-smoke.sh` | 本地 Docker 冒烟（`--server` 追加构建 + 运行态冒烟） |
| `pnpm ops:server-smoke` | `server-smoke.sh` | server 镜像运行态冒烟（/health + entrypoint 三段断言；前置：镜像已构建 + ops:env-up） |
| `pnpm ops:coverage` | `coverage.mjs` | 本地覆盖率一键跑（`--skip-env` 跳过环境启停） |
| `pnpm ops:check-digests` | `check-digests.sh` | 镜像 digest pin 漂移巡检（季度，`docker buildx imagetools inspect` 比对） |
| `pnpm ops:upstream-diff` | `upstream-diff.sh` | pure-web 上游漂移报告（基线 SHA + target ref → 改动清单 / 变更地图 / 冲突面三件套；无基线参数降级仅本地侧） |
| `pnpm ops:worktree-init` | `worktree-init.sh` | 通用仓库就绪：`.git` 类型自动判定双场景（worktree 检出后初始化：依赖安装 + 主仓库 env 类文件白名单同步 + 钩子兜底；新克隆引导：技术栈探测 + `.env.example` 生成）；零依赖单文件，可复制到其他仓库；engines 校验读目标仓库 `package.json`；Windows 下经 WSL bash 执行，调用方须自仓库根以相对路径调用 |

## 一次性迁移

⚠️ **降采样库一次性迁移**：降采样由 worker 侧定时重算、不用流。带旧开发卷的环境，`wewant_iot_ds` 内的聚合产自流机制、**不可信**，须手动 `DROP DATABASE wewant_iot_ds` 后重跑 `ops:tdengine-init` 重建。

该 DROP 是**一次性人工动作、不进脚本**——`ops:env-up` 每次启动都调脚本，DROP 进脚本会把归档一并清掉；`wewant_iot` 原始库不受影响。

## 前置依赖

- gh CLI（ci-status / ci-logs，需首次 `gh auth login`）。
- Docker Desktop（env-up / smoke / coverage / check-digests）。
- Git Bash 或 WSL bash（shell 脚本执行；仓库 `.sh` 统一 LF 行尾，见根 `.gitattributes`）。
- 可联网环境（upstream-diff，需 fetch github）。
- 干净检出：`ops:env-up` 会在 seed 前构建 `@multi-admin/device-registry...`（含 contracts），`tdengine:init` 自身也经 turbo 先构建依赖；单独跑 `prisma db seed` 前仍需先构建 contracts。

`check-digests` 远端比对依赖可联网环境：本机无 Registry 直连时按设计输出「远端 digest 获取失败」exit 1（本地同 tag 一致性检查仍有效）；CI 无该巡检 step（不在 CI 内新增验证逻辑），首次在线巡检需在可联网环境手动执行一次。

## 验证探针

把官方文档说不清、又与决策相关的**服务端行为**跑成可复现的证据。约定：**零依赖**（只用 Node 内建 `fetch` 或仓库已有依赖）、走服务端自有接口、结论落进 `docs/tasks/` 并把查证状态登记到知识库的查证台账。

| 脚本 | 职责 |
|---|---|
| `tdengine-semantics.mjs` | TDengine 语义：省略列 / `NONE` 与 `NULL`、`ALTER STABLE` 代价、虚拟表能力边界、跨超表查询约束（走 taosAdapter REST） |
| `tdengine-lifecycle.mjs` | TDengine 生命周期：社区版审计能力、`ALTER DATABASE` 能力边界（`KEEP` 可改 / `DURATION` 不可改）、跨库查询、三级链式降采样、`avg of avg` 偏差、窗口 offset 与时区 |
| `tdengine-container.sh` | 起临时容器 → 等 taosAdapter 就绪 → 跑探针；`--down` 停掉 |
| `taosdump-roundtrip.sh` | `taosdump` 备份 / 恢复往返（内容全部在容器内执行）：`-M all` 往返、`-S`/`-E` 时间范围归档、`-M ext-meta` 备份流定义、`-W` 改名恢复、**`-M` 两侧不一致时的静默失效**。⚠️ 与 `tdengine-container.sh` 共用同一个容器 |

⚠️ **另有四个探针在应用目录下**，不在此目录——它们需要某个**按 catalog 判据只属于该应用**的依赖，仓库根没有，Node 从脚本所在目录向上解析依赖：

- `apps/iot-simulator/scripts/`：`mqtt-protocol-probe.mjs` / `mqtt-credential-probe.mjs`（需要 `mqtt`）。凭据探针还需一个**配了认证器的独立 Broker**（开发环境那台默认无认证，不适用）
- `apps/nestjs-server/scripts/tdengine-stmt-probe.mjs`（需要 `@tdengine/websocket`）：TDengine STMT 写入形态——一次 exec 跨多子表、两种跨子表写法、`USING` 语法自动建表、单次 bind/exec 的行数上限。
  ⚠️ 它建自己的库 `probe_stmt` 并反复重建超表，**不要指向有数据的实例**
- `apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs`（需要 `@tdengine/websocket`）：TDengine「形态②」（`INSERT INTO <stb> (tbname, tag…, ts, …)` 且 `tbname` 作普通绑定参数）的两项行为。
  - 缺子表时**报错还是静默建表**；一次 `exec` 能否跨多个子表。
  - **STMT2（连接器默认）与 STMT1（写入器强制）两条路径都测**。
  - ⚠️ 它建**自己的临时库** `probe_stmt_tb` 并跑完整库删掉，另快照 `wewant_iot` / `wewant_iot_ds` 的建表指纹验证真实库未被波及，**不要指向有数据的实例**。

## Shell 断言约束

`set -o pipefail` 下 `docker logs X | grep -qF` 断言必假：`grep -q` 命中即退出使 `docker logs` 收到 SIGPIPE（exit 141），管道整体非零、`if` 恒假。写法必须是先捕获变量（`LOGS="$(docker logs X 2>&1 || true)"`）再 `echo "${LOGS}" | grep -qF` 断言。

# 增量 1 验收记录

## 环境

- Docker Desktop 29.8.2；compose 五服务（本次新增 emqx）
- EMQX 6.3.1，digest `sha256:5ecbf93d…d9606`，listener 与 Dashboard 均只绑宿主回环
- 本地启动：`pnpm ops:env-up`（postgres + redis + emqx）→ `pnpm dev:sim` → 后端

## 判据：消息在 Broker 侧可见（双证据）

### Broker 侧（EMQX `/api/v5/monitor_current`）

| 指标 | 值 |
| --- | --- |
| `live_connections` | 101（100 台设备 + 1 个订阅者） |
| `received_msg_rate` / `sent_msg_rate` | 92 / 92 |
| `subscriptions` | 1（后端通配订阅 `wewant/devices/+/telemetry`） |

### 订阅端（nestjs-server 结构化日志）

```text
设备上行订阅目标：mqtt://127.0.0.1:1883，主题 wewant/devices/+/telemetry
已订阅 wewant/devices/+/telemetry
telemetry 每秒 100 条 / 300 测点 / 100 台设备
```

聚合行连续出现，与 Broker 侧数字互为印证；`100 条 / 300 测点 / 100 台设备` 正是每台设备每秒 3 测点的契约形态。

## 质量门禁

| 项 | 结果 |
| --- | --- |
| `pnpm check` | 全量通过（prettier / typecheck / lint / stylelint / test）；`iot-simulator` 已进入 test 覆盖枚举且为「有 test 脚本」 |
| nestjs-server `test:coverage`（单测 + e2e 合并） | 语句 98.07% / 分支 87.43% / 函数 96.53% / 行 98.30%（门禁 ≥80%） |
| 套件 | 单测 41 套件 224 例；e2e 4 套件 31 例（含新增 iot 接入 2 例） |
| `pnpm doc:lint` | 仅剩 `build-and-verify.md` 的 covers 时间戳漂移，随本次文档更新在提交后清除 |

## 执行中发现

### 1. 同一 clientId 的双实例让连接反复被顶替

现象：模拟器输出 2700 次「已连接」，但汇总始终「在线 0/100」。

根因：先前启动的模拟器进程（`tsx watch` 子进程未被一并终止）仍在运行，与新实例同用 `sim-001`…`sim-100` 作 clientId。MQTT 仅凭 clientId 识别并恢复会话，Broker 会让新连接顶断旧连接——两个进程因此无限互踢。

处置：终止孤儿进程后恢复稳定 100/100。

价值：这是[决策卡](2026-10-05-decisions.md) D2 引用的一条官方失败模式（clientId 未与认证身份绑定时，持任意有效凭据者可抢占他人会话）的现场复现。已把运行注意写入模拟器 README。

### 2. 本地 JWT 密钥长度不满足 env schema（既有问题）

`apps/nestjs-server/.env`（gitignored）与根 `.env` 中的 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 为 21–23 字符，低于 2026-08-27 落地的 `min(32)`，因此 `pnpm dev:server` 与 compose 的 server 服务都会启动即崩。与本次改动无关。

演示时以「直连应用目录 + 内联长密钥」绕开：turbo 的 strict env 模式会过滤未在 `turbo.json` 声明的变量，故内联变量经 `pnpm dev:server` 传不进应用。

## 验收结论（2026-10-05，通过）

四拍制的第④拍完成；逐题记录见 vault `iot-learning/学习台账.md`。

| 项 | 结果 |
| --- | --- |
| 独立走通一条数据流 | 通过（首次偏薄，补齐「主题匹配 → 通配订阅 → 解析校验 → 窗口汇总」四跳后完整） |
| 边界：做了什么 / 没做什么 / 为什么留到那时 | 通过；并自行归纳出「交付分期」与「触发点驱动」两类未做项 |
| 安全姿态与触发点 | 通过；机制补全为「listener 只绑宿主回环」 |
| 固定一问：上生产先坏在哪 | 通过；补出比「绑回环」更隐蔽的一条——QoS 0 静默丢数据 |
| 自测题 5 道 | 核心 3/3、拓展 2/2 |

**验收中暴露、移入增量 2 的两项**：QoS 0 的静默丢失（本增量唯一的真缺口）；设备时钟不可信与双时间轴（事件时间 + 平台接收时间）的设计。

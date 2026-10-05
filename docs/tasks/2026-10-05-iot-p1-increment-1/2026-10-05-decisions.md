# 增量 1 决策卡

本增量的四项决策。结论按「本地开发阶段 / 生产部署阶段的差异」与**触发点**两栏收口——栏目记的是部署形态差异，不是工程标准的差异。

引用来源均附查证日期；无法取证的观点标注为【AI 判断】。

---

## D1 模拟器位置

**背景**：模拟器必须发 MQTT，于是必须有 MQTT 客户端依赖。根 [AGENTS.md](../../../AGENTS.md) 禁止靠根 `package.json` hoisting 共享依赖，因此模拟器必须是 pnpm workspace 成员、有自己的 `package.json`——"裸脚本丢在 scripts/ 下"这条路直接排除。

**选项与结论**

| 选项 | 结论 |
| --- | --- |
| `apps/iot-simulator`（第五个应用） | **采纳** |
| `tools/iot-simulator`（新建顶层目录） | 否决：仅语义差异，仍要进 turbo 任务图，却多引入一层顶层目录语义 |
| 挂在 nestjs-server 下作内部脚本 | 否决：设备侧与平台侧代码耦合在同一应用，依赖声明也混在一起 |

**理由**：模拟器在语义上就是设备侧的一个"端"，与 web / server / mobile / desktop 并列。增量 6 的千级压测与混沌演练是它的主场，增量 7 开源收口也需要一个可指认的资产。

- **本地开发阶段 / 生产部署阶段的差异**：本地开发阶段它跑在同一台机器上；生产部署阶段它是测试资产，不进生产拓扑。
- **触发点**：增量 6 若单机压不动目标规模、需要分布式压测时，它才需要具备跨机器部署能力。
- **面试讲法**：设备模拟器为什么应当独立成应用，而不是测试脚本——它要长期演进出连接规模、断连恢复、故障注入三类能力，塞进测试目录会先死于依赖与任务图。

---

## D2 接入安全姿态

**背景**：设备与平台之间的身份链有传输（TLS）、身份（凭据）、授权（ACL）、绑定（clientId）四层。本增量是否需要其中任何一层。

**结论**

1. **不配认证器**（EMQX 未配认证器时默认放行所有客户端），
2. **listener 与 Dashboard 均只绑 `127.0.0.1`**，
3. 现在就做到位的 broker 侧姿态：生产前改 Dashboard 默认密码（从 `.env` 注入）、不映射用不到的 listener 端口（8883 / WebSocket 全部不暴露）。

**理由**

- **四层挂在同一个前提上**：它们共同依赖"攻击者够得着端口"。绑 loopback 拆掉该前提后，四层在本阶段的威胁模型（客户端全是本机进程）里都没有立足点。
- **认证与加密同生同死**：明文 1883 上跑每设备凭据，凭据本身是明文传输的——在非本机场景下等于把全部凭据沿路广播。所以"上了凭据但没上 TLS"不是半个安全，是一次凭据泄露。两者必须作为一个包同时上。
- **每设备凭据的生产形态不是"seed 进内置数据库"**：生产是**凭据由平台签发、Broker 向平台核验**（HTTP 认证器 / JWT），或 mTLS 证书由平台 CA 签发——那需要一个平台侧的设备档案，属增量 3。现在把账号 seed 进 Broker 内置库，得到的是"看起来像生产"，且增量 3 建好设备档案后即报废。

**来源（查证 2026-10-05）**

- EMQX《Security Checklist》<https://docs.emqx.com/en/emqx/latest/guides/access-control/security-checklist.html>
  - Phase 4：「By default, EMQX allows all clients to connect if authentication is not enabled」（未配认证器即放行）；「Prefer per-device or per-application credentials instead of shared usernames, passwords, or certificates」（共享凭据是反模式）；client ID 需与认证身份绑定，否则持有任意有效凭据者可凭已知 client ID 抢占他人会话（MQTT 仅凭 client ID 恢复会话）
  - Phase 3：跨不可信网络的 MQTT listener 必须 TLS；需校验设备身份时启用 mTLS
  - Phase 5：生产前改默认 Dashboard 密码；Dashboard 只留可信网络、尽量绑 localhost / 私网 / 管理网
  - Phase 1：只暴露客户端真正需要的 listener；访问控制可用 `listeners.{type}.{name}.access_rules`
- AWS IoT Core《X.509 client certificates》<https://docs.aws.amazon.com/iot/latest/developerguide/x509-client-certs.html>：「We recommend that each device or client be given a unique certificate to enable fine-grained client management actions, including certificate revocation」，且设备必须支持证书轮换

**一处需要记录的偏差**：EMQX 官方 Phase 1 给出的 `access_rules` 写法（`allow <trusted-CIDR>` / `deny all`）在本仓库的容器拓扑下**不能照抄 `127.0.0.1`**——宿主经端口映射连入容器时，容器看到的源 IP 是 docker 网关而非 `127.0.0.1`，照填会把后端与模拟器一并挡在门外。【AI 判断，需实测确认】本增量的边界由**宿主端口绑定**承担，compose 私网本身已与宿主外部隔离。

**本地开发阶段 / 生产部署阶段的差异**：本地开发阶段全部组件同机，边界由 loopback 承担；生产部署阶段需 TLS（跨网络）/ mTLS 或每设备凭据 + ACL 按主题限权 + clientId 绑定身份 + 只暴露必要 listener 且限可信网段 + Dashboard 进私网并改用 API Key 调管理 API。

**触发点**

| 触发事件 | 需要同时做的事 |
| --- | --- |
| **出现不在本机的客户端**（P2 真实硬件，或把后端 / 模拟器移出本机） | 一次性上四层：绑私网接口 + TLS + 每设备凭据 + ACL + 可信 CIDR 限制，并把认证源切到平台 |
| 设备规模到千级（增量 6 压测） | 认证源从 Broker 内置数据库换成平台签发（HTTP 认证器 / JWT） |
| 需要给他人查看 Dashboard | 改绑私网接口 + 反向代理 + HTTPS；调管理 API 改用 API Key |
| 对外提供服务 | 回 [ADR-009](../../decisions/ADR-009-iot-platform-p1-stack.md) D4 重估 |

**面试讲法**：为什么"我加了用户名密码"不等于安全——凭据在明文链路上跑；为什么共享凭据是安全剧场——它拦不住任何一台设备冒充另一台，却让人以为已经有门禁；为什么认证与 TLS 必须同时上。

---

## D3 主题与载荷格式

**结论**

```
wewant/devices/{deviceId}/telemetry          deviceId: sim-001 … sim-100
订阅通配：wewant/devices/+/telemetry
```

```json
{
  "deviceId": "sim-001",
  "ts": 1759603200000,
  "metrics": [
    { "key": "temperature", "value": 62.4, "unit": "°C" },
    { "key": "vibration", "value": 1.82, "unit": "mm/s" },
    { "key": "current", "value": 4.31, "unit": "A" }
  ]
}
```

落 TDengine 时直接拆成 `(ts, deviceId, key, value)` 三元组，与增量 2 的超级表建模同形。

**理由**

- 主题形态采用"按设备 ID 分层、通道段结尾"：Azure IoT Hub 官方约定为 `devices/{device-id}/messages/events/`【Microsoft Learn，查证 2026-10-05】。本仓库加 `wewant/` 前缀隔离命名空间。
- **不以 `$` 开头**：MQTT 规范把 `$` 前缀保留给 broker 内部主题（如 `$SYS/`）。
- 载荷定位为"一次上报含多个测点"，而非"一条报文一个值"：既减少报文数，又天然映射三元组。

**QoS 用 0**。QoS 只影响投递给订阅者的保证，**不改变主题与载荷契约**，因此它不是地基决定；投递保证（QoS 0/1/2、持久会话、重复与幂等）整体归增量 2——那才是需要它的问题。

**契约归属**：主题模板常量与上行载荷类型进入 `packages/contracts` 新增的 iot 段。模拟器与后端两端消费同一份定义，避免漂移；这也是 [ADR-009](../../decisions/ADR-009-iot-platform-p1-stack.md) D3「契约先行」的落地。

**本地开发阶段 / 生产部署阶段的差异**：本地开发阶段单租户，主题不含租户段；生产部署阶段若需多租户，主题前缀应扩为 `{tenant}/`，且它同时就是 ACL 的授权单位。

**触发点**：增量 3 物模型在此主题下扩展 event / service 通道（`…/event`、`…/service`），telemetry 通道本身不变。

**面试讲法**：主题设计为什么是授权的基本单位——ACL 按主题授权，主题层级即权限边界。

---

## D4 测试策略

**结论**：单测覆盖载荷解析与聚合统计等纯逻辑；新增 e2e 用例连 compose 里的真实 EMQX，验证 connect → subscribe → 收到消息 → 出日志的完整链路；CI 的 e2e job 增加 emqx service。

**理由**：仓库对 nestjs-server 有单测 + e2e 合并覆盖率 ≥80% 的门禁，iot 域必须有测试。而 mqtt.js 的连接 / 订阅 / 重连这段接线是最容易坏的部分，也正是不落库、不进队列的本增量唯一有真实外部依赖的地方——用假客户端覆盖不了它。

**本地开发阶段 / 生产部署阶段的差异**：本地开发阶段 e2e 连本机 EMQX 容器；生产部署阶段这是集成测试的常态，不改形态。

**触发点**：无。

---

## 环境前置与已知问题（查证 2026-10-05）

| 事项 | 状态 |
| --- | --- |
| Docker daemon | 运行中（Server 29.8.2） |
| Docker Hub 直连 | **不通**（`registry-1.docker.io` 超时）。镜像拉取依赖 Docker Desktop 已配置的加速器（`docker.m.daocloud.io` 等三个，其中 `hpcloud` 那个返回非 JSON、不可用） |
| EMQX 版本 | `6.3.1` 是当前最新 6.3.x（6.3.2 / 6.3.3 不存在；浮动标签 `6.3` 也指向 6.3.1）。digest `sha256:5ecbf93d04e34aaf4096af074e93b773d0838c8ea668cfabdec7976b272d9606` **取自加速器，未能与上游核对**（Hub 不可达） |
| EMQX 容器化写法 | 健康检查沿用官方示例 `["CMD","/opt/emqx/bin/emqx","ctl","status"]`；HOCON 键 `dashboard.default_password` 存在，按官方 `EMQX_<段>__<键>` 双下划线嵌套约定即 `EMQX_DASHBOARD__DEFAULT_PASSWORD`——**实测生效**（容器内 `env` 可见，且以 `admin` + 该密码调 `/api/v5/login` 返回 200）。注意 `env-up.sh` 内不可用 `docker compose exec ... /opt/emqx/bin/emqx`：Git Bash 会把容器内绝对路径转成 Windows 路径，改用 `docker compose ps --format '{{.Health}}'` 判断 |
| EMQX 许可（实测 `/api/v5/license`） | 无 license key 时以 **community** 许可运行：`max_connections` 1000 万、`max_sessions` 1000 万、`max_tps` infinity、无到期（`expiry_at` 2029-03-01）。**镜像自身标签为 `edition: Enterprise` / `title: emqx-enterprise` / `licenses: BSL-1.1`**——镜像统一、许可决定版本。企业版专属能力（SSO / MFA / 审计日志等，官方文档明确标注 Enterprise）不在免费档内 |
| `pnpm ops:check-digests` | 本机跑不通，且这是**既定行为**：[build-and-verify.md](../../engineering/build-and-verify.md) 已载明「本机无 Registry 直连时按设计输出『远端 digest 获取失败』exit 1，本地同 tag 一致性检查仍有效」。因此本次 pin 的 digest 无法在本机与上游核对，**首次在线巡检需在可联网环境手动执行一次** |

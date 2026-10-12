# iot-simulator

IoT 平台的设备模拟器：以 MQTT 向 EMQX 上行虚拟设备遥测，用于在没有真实硬件时打穿「设备 → Broker → 订阅端」这条链路，以及后续的规模压测与断连演练。

## 启动

前置：EMQX 已起（仓库根 `pnpm ops:env-up`）。

```bash
pnpm dev:sim                                        # 100 台设备，1 Hz
SIM_DEVICE_COUNT=500 pnpm dev:sim                   # 改规模
SIM_INTERVAL_MS=200 pnpm dev:sim                    # 改频率
MQTT_URL=mqtt://192.168.1.10:1883 pnpm dev:sim      # 指向别的 Broker
```

| 环境变量           | 缺省                    | 说明                                |
| ------------------ | ----------------------- | ----------------------------------- |
| `MQTT_URL`         | `mqtt://127.0.0.1:1883` | Broker 地址                         |
| `SIM_DEVICE_COUNT` | `100`                   | 虚拟设备数（`sim-001` … `sim-NNN`） |
| `SIM_INTERVAL_MS`  | `1000`                  | 每台上行间隔                        |

## 主题与载荷契约

契约的权威定义在 `packages/contracts` 的 iot 段（`telemetryTopic` / `TELEMETRY_TOPIC_FILTER` / `TelemetryPayload`），本模拟器与 nestjs-server 消费同一份，不在应用内各自写常量。

**主题**（按设备 ID 分层、通道段结尾；不以 `$` 开头，该前缀由 MQTT 规范保留给 broker 内部主题）

```
wewant/devices/{localDeviceId}/telemetry
```

订阅端通配：`wewant/devices/+/telemetry`（`+` 匹配单层 localDeviceId）。

⚠️ **主题段是路由地址，不是身份**：段里放的是设备**自报**的 `localDeviceId`。平台签发的 `deviceId` 不下发设备，身份以载荷为准，订阅端只拦截两者不一致的报文。

**载荷**（JSON / UTF-8）

```json
{
  "localDeviceId": "sim-001",
  "ts": 1759603200000,
  "metrics": [
    { "key": "temperature", "value": 62.4, "unit": "°C" },
    { "key": "vibration", "value": 1.82, "unit": "mm/s" },
    { "key": "current", "value": 4.31, "unit": "A" }
  ]
}
```

- `ts` 为 epoch 毫秒：设备侧无时区上下文，毫秒数在链路上无歧义，且与 TDengine 的时间戳存储同形。
- `localPointId`（可选）为设备自报的采集点编号，**仅多点设备需要**；单点设备可缺省。
- `metrics` 一次携带多个测点，落库时即拆成 `(ts, deviceId, key, value)` 三元组（这里的 `deviceId` 是**平台签发**的，由档案从 `localDeviceId` 映射而来）。
- QoS 0。投递保证（QoS 语义、持久会话、重复与幂等）属数据链路增量，不在接入增量内。

## 形态说明

- **单进程 100 条连接**，不是 100 个进程：被压的对象是连接与消息速率，进程数不反映真实约束。
- **协议版本两版并存**：奇数台（`sim-001`、`sim-003`…）用 MQTT 5.0，偶数台用 3.1.1——现场不同时期、不同厂商的设备协议版本不一致，接入端必须两版都能收。
- `clientId` 用 `localDeviceId`，与生产口径「clientId 绑定设备身份」同形。**因此不要同时运行两个模拟器实例**：MQTT 仅凭 clientId 识别并恢复会话，Broker 会让新连接顶断旧连接，两个进程会以同一批 clientId 无限互踢——现场表现为「已连接」日志持续刷屏而汇总长期「在线 0/100」。
- 断连期间跳过发布并在重连后自动恢复；进程收到 `SIGINT` / `SIGTERM` 时先断开全部连接再退出。

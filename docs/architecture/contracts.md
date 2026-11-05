---
status: living
covers:
  - packages/contracts/
  - apps/nestjs-server/src/
  - apps/pure-web/src/api/
  - apps/pure-web/mock/
  - apps/iot-worker/src/
last_verified: 2026-11-05
---

# contracts 契约包

## 定位与约束

- `packages/contracts`（`@multi-admin/contracts`）是前后端接口契约的唯一载体：响应信封、错误码、分页与各域 VO/DTO 类型。nestjs-server（Nest，ESM）与 pure-web（Vite；mock fixture 同形标注）双端消费。
- 只放**纯类型与常量值**（如 BizCode / MenuType 枚举对象）；不放运行期逻辑、校验规则（class-validator DTO 留 server 侧）与框架依赖。
- 构建为 tsdown ESM+CJS 双格式 + 双 d.ts（`format: ['esm', 'cjs']`，`dts: true`），应对 Vite / Nest（`type: module`）/ jest（CJS）三种消费场景。
- 消费方一律 `workspace:*` 引用；消费方的 typecheck / test / build 任务经 `turbo.json` 的 `^build` 先构建 contracts，防陈旧产物参检（决策见 ADR-005）。

## 设备接入契约（iot 段）

契约包除前后端 HTTP 接口外，还承载**设备侧契约**：主题模板 `wewant/devices/{localDeviceId}/telemetry`、订阅端通配过滤器、上行载荷类型，以及遥测入库队列的队列名与键前缀（选型与边界见 [ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md) D3、[ADR-010](../decisions/ADR-010-ingest-buffer-bullmq.md)）。

- **与 HTTP 契约的区别**：不走向应信封与 BizCode 体系——设备不认 HTTP，也不消费错误码；设备与订阅端只共享主题形状与 JSON 载荷。
- **放这里的理由与 HTTP 契约一致**：发布方（设备 / 模拟器）与订阅方（订阅端 / 消费者）消费同一份定义，避免各自写常量后漂移。
- **主题段是路由地址、不是身份**：段里放设备自报的 `localDeviceId`（`telemetryTopic` 生成、`localDeviceIdFromTopic` 逆运算）；平台不以其判定身份——**身份以载荷为准**，订阅端只做一致性拦截（主题段与载荷不一致即丢弃 + 计数 + 告警）。
- **载荷字段**：`localDeviceId`（设备自报编号，与主题段同值）、`ts`（epoch 毫秒）、`metrics[]`（每项 `key` / `value` / `unit`）。`value` 是 `MetricValue` 联合——**number / boolean / string / 对象**（结构体序列化成 JSON 存一列），类型由物模型声明，载荷只保证"能表达"；深度校验（子字段、长度上限、数组拒绝）在模型层。载荷字段与主题占位段统一用 `localDeviceId`（早期草案的 `deviceId` 已弃用），wire format 以本契约为准；`unit` 随载荷上报、供与模型声明比对，不落存储列。
- **设备侧编号约定**：`localDeviceIdForIndex` 生成 P1 编号（`sim-001`…），模拟器与设备档案共用同一函数，不靠事后断言对齐；`normalizeLocalId` 统一去首尾空白 + 小写（只处理同一台设备前后不一致，不跨设备去重）。
- **队列常量**：`TELEMETRY_INGEST_QUEUE`（`iot-telemetry-ingest`）与 `TELEMETRY_QUEUE_PREFIX`（`wewant`）。生产者（订阅端）与消费者（`apps/iot-worker`）分属两个应用，队列名必须一处定义，否则两端会各自连到不同的队列而不报错。⚠️ 队列名**不能含 `:`**——BullMQ 用它作 Redis 键分隔符，含冒号构造即抛；故分隔符用 `-`，命名空间交给 `prefix`。⚠️ 反之，**同一应用内**的队列不属契约、就地定义即可——如降采样环的 `iot-telemetry-downsample`，其调度注册与消费都在 `apps/iot-worker` 进程内，没有第二个应用引用它（判据是"是否跨应用"，不是"是不是队列"）。
- **通道**：`IotChannel` 定义 `telemetry` / `service` / `event` 三个通道位，本增量只实现 `telemetry` 通路。订阅端只订遥测，`localDeviceIdFromTopic` 也只认 `telemetry`——放宽解析等于悄悄扩大订阅面。
- **契约边界**：主题、上行载荷与队列名属契约；写哪张表、DDL 形态**不属**契约——归 `apps/iot-worker` 内部（schema 定义与建库脚本均在该应用内）。同理，**存储列类型档位**（`FLOAT` / `DOUBLE` / `INT` / `BIGINT` / `BOOL` / `VARCHAR` 与 `VARCHAR(N)` 上限）、**进 DDL 的标识符校验**（属性 key、模型编码）以及**物模型的声明与校验**（属性档位、聚合集、结构体子字段）也不属契约，归 `packages/device-registry`——它们描述列与表名的形状，不是线上载荷。

## 契约扩展流程（contracts 先行）

1. 在 `packages/contracts/src/<域>/` 新增或修改类型，构建包验证。
2. server 实现端点并以 `satisfies` / 编译期断言钉住形状；域契约一致性单测钉住序列化形态。
3. 前端 api 层与 mock fixture 同步升级后，页面接线。
4. 禁止反向：不允许前后端任一端自造请求/响应类型再回填契约。

## 响应信封与错误码

- 所有端点成功响应为 `ApiResponse<T> = { code, message, data }`；错误响应同信封，HTTP 状态按码段规则 `httpStatus = Math.floor(code / 100)`。
- 校验失败（`VALIDATION_FAILED` / 40001）时 `data.errors` 为字段级明细 `Array<{ field: string; message: string }>`（`field` 为点分路径，嵌套 DTO 如 `meta.title`）；其余错误 `data: null`。
- 错误码表（BizCode，contracts 为事实源）：

| 常量 | 码值 | 语义 |
|---|---|---|
| SUCCESS | 0 | 成功 |
| VALIDATION_FAILED | 40001 | 参数校验失败 |
| UNAUTHORIZED | 40101 | 未认证 / 凭证错误 |
| ACCESS_TOKEN_EXPIRED | 40102 | access 过期（前端刷新后无感重试） |
| REFRESH_TOKEN_INVALID | 40103 | refresh 失效（登出 / 已轮换） |
| FORBIDDEN | 40301 | 权限不足 |
| NOT_FOUND | 40404 | 资源不存在或已软删 |
| CONFLICT | 40900 | 资源冲突（唯一约束、禁用超管或自身、父子循环引用等） |
| LOGIN_ACCOUNT_LOCKED | 42301 | 登录账号已锁定（等待自动解锁） |
| RATE_LIMITED | 42901 | 触发限流 |
| INTERNAL_ERROR | 50000 | 内部错误 |

## 分页与时间约定

- 分页查询用 query 参数 `page` / `pageSize`（PageQuery）；分页响应 `PageResult<T> = { items, total, page, pageSize }`，目前仅 user/role 列表使用；菜单全量树与 `roles/all` 不分页。
- 时间统一 `IsoDateTimeString`（ISO 8601 字符串，Date 序列化形态）；id 统一 `EntityId`（cuid 字符串）。
- 过渡期例外：监控域与 mine-logs 为 mock-only 端点，仍用旧形状 `{ list, total, pageSize, currentPage }`（登记于 governance backlog，后端实施后迁移）。

## pure-web 数据源开关（VITE_MOCK）

- `VITE_MOCK=true`：`vite-plugin-fake-server` 注册 `mock/` 路由（`enableProd` 注入 prod 构建）；`false` / 缺省：不注册插件，dev server 将 `/api/v1` 代理至 `http://localhost:3000`。
- mock fixture 与真实后端保持**契约同形**：同信封、同路径、同类型标注；切换数据源不改页面与 api 代码。
- Mock-only 端点（后端未实现）：`/api/v1/system/dept`、监控四类日志与详情、`/api/v1/mine-logs`；前端调用方必须 try/catch 降级。

# S4 · 注册路径：设计与实施计划

- **日期**：2026-11-05｜上承 [范围定稿](2026-11-01-scope-and-task-map.md) S4 与 [D3 决策卡](2026-11-05-d3-decision-card.md)
- **出口**：注册一台**新类型设备**（含 BOOL 与枚举测点），原始超表、子表、降采样超表与子表全部由模型生成，**仓库无 diff**；模型内演进走加列；注册失败整体回滚、档案不落库，残留表可被审计认出
- **前置**：D3 已定（2026-11-05）；S2 已交付四张档案表与只读仓储；S3 已交付声明校验与降采样列推导

## 0. 开工前的四处缺口

S3 与 S2 各自把边界画在了"自己那一侧"，交界处留下四样东西：

| # | 缺什么 | 谁该补 | 不补的后果 |
| --- | --- | --- | --- |
| 1 | **属性档位 → 原始列类型**的映射不存在。`column-type.ts` 只有六个档位常量，`AGGREGATE_COLUMN_TYPE` 只覆盖降采样侧 | S4 | 原始超表建不出来。S3 的推导只管 `sum_/count_/min_/max_` 四类列，`temperature FLOAT` 这一列由谁定没有答案 |
| 2 | **同一模型至多一个 `ACTIVE` 版本**没有库级约束。S2 只对 usage 加了 partial unique index | S4 | 并发发布两个版本时两条都 ACTIVE，「当前版本是哪一版」变成不确定 |
| 3 | server 侧**没有 TDengine 客户端，也没有 `TDENGINE_URL` 配置**。`@tdengine/websocket` 在 `dependencies` 里但 `src/` 无引用 | S4 | 建表无处执行 |
| 4 | **版本状态缺"退役"态，多出一个"失败"态**。S2 的设备与版本共用 `IotStatus`（`PENDING` / `ACTIVE` / `FAILED`） | S4 | 前者：发布新版本时旧 ACTIVE 版本无处可去。后者：注册失败时不落库，`FAILED` 行永远不会出现，是个死值 |

第 1 条不是笔误：S3 的推导函数名是 `dsColumnsOf`，从一开始就只管降采样。原始列的映射要在 S4 补，且**必须与 `AGGREGATE_COLUMN_TYPE` 同处**，否则两处各自理解"什么档位落什么列"。

第 4 条来自两处：D2 §11 只定了 `ACTIVE/FAILED` 挂版本，`PENDING` 是 D3 的注册流程引入的中间态，**没有人给"退役"留位置**——而多版本并存是 D2 §11 自己要求的（物理一份、逻辑多版）。同时注册失败一律整体回滚、档案不落库（D3 §2.5），`FAILED` 行永远不会被写出来。

### 0.1 拆枚举，去掉 FAILED

`IotStatus` 现在服务两个对象：设备的 `PENDING → ACTIVE`，版本的同一套再加退役。两者状态集合已经不同，共用一个枚举只能取并集——设备会多出永远用不到的 `SUPERSEDED` 与 `FAILED`，版本状态在类型上也看不出"退役"这回事。

拆成两个：

```prisma
enum IotDeviceStatus {
  PENDING
  ACTIVE
}

enum IotVersionStatus {
  PENDING
  ACTIVE
  SUPERSEDED
}
```

`PENDING` 保留在枚举里但**本增量不产生**：注册失败不落库，PG 里只会出现 `ACTIVE` 行。留着它是因为 D3 §2.3 的两条状态机确实有"进行中"这一语义位置，而 D3 §5 的复查触发点（注册耗时变长、需要批量导入）一旦命中，异步化就要用到它。

迁移由 `prisma migrate dev` 生成（枚举重建，Prisma 会写成 create type → alter column → drop type），`IotStatus` 在设备列改完之后删除。今日库里只有 `p1` v1 一行 `ACTIVE`，转换无风险。

## 1. 形状

| # | 任务 | 落在 |
| --- | --- | --- |
| T1 | 命名函数移包（D3 §2.2 连带结论）+ 版本状态拆分 + 补库级不变量 | `packages/device-registry` / 迁移 |
| T2 | 原始列类型推导 | `packages/device-registry/src/column-type.ts` |
| T3 | TDengine 接入（配置、懒连接） | `apps/nestjs-server/src/modules/iot/tdengine/` |
| T4 | DDL 生成（按模型推导，不含命名） | `apps/nestjs-server/src/modules/iot/schema/` |
| T5 | 物模型定义接口 | `apps/nestjs-server/src/modules/iot/models/` |
| T6 | 设备档案注册接口 | `apps/nestjs-server/src/modules/iot/devices/` |
| T7 | 测试（单测 + 真库 e2e） | 同名目录 / `test/` |
| T8 | 文档 | `backend.md` / `contracts.md` / 任务 README |

**四条边界**：

- **DDL 语句在 server 内**，不进共享包（D3 §2.2）；进包的只有**表名**
- **不加权限点**：全局 `JwtAuthGuard` 已覆盖，D3 §5 的复查触发点（出现第二个操作者）未到
- **不做注销与删除路径**（D5 / S6），失败清理只删**本次注册建的表**
- **不动 `DeviceRegistry`**：worker 读档案仍是 D1 / S5

## 2. 设计

### 2.1 T1 命名函数移包 + 补一条不变量

`apps/iot-worker/src/schema.ts` 的四个命名函数与 `DsLevel` 类型移进 `packages/device-registry/src/naming.ts`，与已有的 `subtableName` 同处：

```ts
export const DS_LEVELS = ['1m', '1h', '1d'] as const;
export type DsLevel = (typeof DS_LEVELS)[number];

export function rawStableName(modelCode: string): string;
export function dsStableName(modelCode: string, level: DsLevel): string;
export function dsLevelSuffix(level: DsLevel): string;
export function dsSubtableName(name: string, level: DsLevel): string;
```

- `schema.ts` 只留库名常量、KEEP、`RAW_METRICS`、建库语句与**建表语句**（那些是 worker 的 dev 补齐脚本用的）
- 调用点全部改为从包 import：`scripts/tdengine-init.ts`、`downsample/query.ts`、`downsample/rows.ts`、`downsample/verify.ts`、`subtables/audit.ts`

**补的库级不变量**（S2 漏的那条）：

```sql
-- 同一模型至多一个 ACTIVE 版本
CREATE UNIQUE INDEX "IotModelVersion_modelCode_active_key"
  ON "IotModelVersion"("modelCode")
  WHERE "status" = 'ACTIVE';
```

迁移手写，与 S2 的 partial unique index 同形态。**这条不写进 schema.prisma**——Prisma 表达不了 `WHERE`，写了会与迁移漂移。

### 2.2 T2 原始列类型推导

`column-type.ts` 新增，与 `AGGREGATE_COLUMN_TYPE` 同文件：

```ts
export interface ColumnIssue {
  path: string;
  code: 'invalid-kind' | 'missing-varchar-length';
}

export type ColumnResult =
  | { ok: true; column: { name: string; type: string } }
  | { ok: false; issues: ColumnIssue[] };

export function rawColumnOf(property: PropertyDecl): ColumnResult;
```

| 档位 | 原始列类型 | 依据 |
| --- | --- | --- |
| `float` | `FLOAT` | D2 §2.4 |
| `double` | `DOUBLE` | 同上 |
| `int` | `INT` | 同上 |
| `bigint` | `BIGINT` | 同上 |
| `bool` | `BOOL` | 同上 |
| `enum` | `INT` | 范围定稿 §3：枚举用 INT + 取值表 |
| `string` | `VARCHAR(n)` | `n` 取声明的 `varcharLength` |
| `struct` | `VARCHAR(n)` | 序列化存一列，`n` 取声明的 `varcharLength` |

⚠️ `string` / `struct` 缺 `varcharLength` 时**不能回落默认值**：列宽一旦定死不可改，给个"够用的默认值"等于把一个要建模人决定的事悄悄替他定了。S3 的校验器已把 `varcharLength` 列为该档位必填，这里只是不替它兜底。

### 2.3 T3 TDengine 接入

`apps/nestjs-server/src/modules/iot/tdengine/`：

- `td-client.ts`：`@tdengine/websocket` 封装，形态对齐 `apps/iot-worker/src/tdengine/client.ts`（`createRequire` 取 CJS 产物、`exec` / `query` / `close`）
- `td-client.provider.ts`：Nest provider，**懒连接**——第一次用到时建立，`OnModuleDestroy` 关。server 是 HTTP 服务，不该因为时序库不可达而起不来；注册请求失败时返回 5xx，其它接口不受影响
- `env.schema.ts` 新增 `TDENGINE_URL`（默认 `ws://root:taosdata@127.0.0.1:6041`，与 worker 同名同默认）
- **`docker-compose.yml` 的 server 服务要显式传 `TDENGINE_URL`**：容器里的 `127.0.0.1` 不是 tdengine 容器，不传就会用默认值、连不上。worker 那行已是显式传的（`ws://root:taosdata@tdengine:6041`），server 照抄

⚠️ **连接器加载时把 winston 的 `ExceptionHandler` 挂到 `uncaughtException`**，而它在当前栈上会自行崩溃、把真正的异常盖掉。worker 侧已摘（`client.ts:18`）。server 侧同样要摘，且必须在**任何自有处理器注册之前**——这是加载顺序问题，不是可以推迟的技术债。摘掉的作用域是**全进程**，所以只做一次。

**连接池容量**：D3 §2.2 的代价项。S4 只开一条连接（建表是低频操作，不做并发），容量模型留给 S5——那时 worker 与 server 会同时持连接。

### 2.4 T4 DDL 生成

`apps/nestjs-server/src/modules/iot/schema/ddl.ts`。**只生成语句，不执行、不带 `IF NOT EXISTS`**。

D3 §2.5 要求「表已存在、列已存在直接报错、阻断注册」。`IF NOT EXISTS` 会把这种冲突变成静默成功，所以这里一个都不用——幂等由**注册流程的状态判断**承担（§2.6），不由 DDL 兜底。

| 函数 | 产出 |
| --- | --- |
| `createRawStable(decl)` | `CREATE STABLE {db}.{rawStableName} (ts TIMESTAMP, {按属性顺序的列}) TAGS (deviceId VARCHAR(16))` |
| `createDsStables(decl)` | 三张降采样超表，列取 `dsColumnsOf(decl.properties)`；**推导失败即整体失败**，不建半张 |
| `alterRawStable(decl, added)` | `ALTER STABLE ... ADD COLUMN {新增属性列}` |
| `alterDsStables(decl, existing)` | 三张降采样超表：**逐级**判断——表不存在按新声明整张建；存在则按**该级现有列**做差集、逐列 `ALTER`。每级一次 `DESCRIBE STABLE` |
| `createRawSubtable(ref)` | 建子表，挂当前模型的超表 |
| `createDsSubtables(ref)` | 三条，每级一张；**只建缺的**，已有的一律不动 |

**无聚合模型不建降采样表**（范围定稿 S5 的前提）：`dsColumnsOf` 返回空列表时，`createDsStables` / `alterDsStables` / `createDsSubtables` 一律返回空数组。这条判断只写一处——`dsColumnsOf(props).columns.length === 0`。

**「建还是 ALTER」按级、按该级现有列判断**：模型首次注册无聚合、之后加带聚合的属性时，三张降采样超表都不存在，按新声明整张建；表存在则只看该级缺哪些列——「1m 已加、1h 失败」的混合状态重放只补 1h。DDL 层收「每级是否在 + 该级现有列」，**不依赖原始超表的列差集**。

**列序**：属性按声明顺序，聚合按 `AGGREGATES` 固定顺序。两者都由 `dsColumnsOf` 与属性数组本身保证，DDL 层不再排序。

### 2.5 T5 物模型定义接口

`POST /api/v1/iot/models`，请求体即 `ModelDeclaration`（S3 的 `validateModel` 的输入形状）。两个入口合一，**由「模型是否存在」分流**：

```text
校验（validateModel）
  ├─ 不通过 → 400，data.issues = 结构化问题表，不写库
  └─ 通过
      ├─ 模型不存在 → 新模型
      │   ① 建原始超表 + 三张降采样超表（无聚合则跳过），逐张记入 createdTables
      │   ② PG 事务：Model + Version(1, ACTIVE, effectiveFrom)
      │   失败：DROP createdTables —— 模型行不存在，超表就是无主物
      └─ 模型已存在 → 发布新版本
           读当前 ACTIVE 版本，比对新旧声明
           → 有 key 的 kind 变了 ⇒ 400（列类型不可改，改档位等于新建模型）
           → 新增属性：先 DESCRIBE STABLE 取现有列，再分类
                 · 声明里有、库里没有 ⇒ 待加
                 · 声明里有、库里已有 ⇒ 上次 ALTER 成功但 PG 没提交，视为已应用
                 · 声明里没有、库里有 ⇒ 旧版本留下的列，不动
           ① 原始超表：ALTER STABLE ADD COLUMN，只加"待加"的列
           ② 降采样超表：**逐级**——不存在按新声明建；存在则按该级现有列差集逐列 ALTER
                 （1m 已加、1h 失败 ⇒ 只补 1h）
                 · 本模型此前无聚合 ⇒ 三张降采样超表一张也没有 ⇒ 按新声明【建】三张
                 · 此前有聚合 ⇒ 三张都在 ⇒ ALTER 补新列的聚合列
                 ⚠️ 建出来的表记入 createdTables——本次失败要删掉
           ③ PG 事务：旧版本 → SUPERSEDED（effectiveTo = now）与新版本 ACTIVE
           ④ 为**该模型下的已注册设备**补建缺的降采样子表
                 · 用 `listSubtablesOfActiveDevices()` 过滤本模型，只建缺的，已有的一律不动
                 · 失败**不回滚模型发布**——记录 + 告警，由审计报 `missingDs`
           失败（①②③）：已加上的列不退（TDengine 删不掉列）；本次建的表删除；PG 回滚，旧版本仍 ACTIVE
```

**①②③ 失败一律不落库**（D3 §2.5）：PG 里什么都不留，没有 `FAILED` 行。因此「上次注册失败的模型」这个状态不存在——模型行在，就一定有 ACTIVE 版本。④ 是版本已经切换之后的收尾，它失败不回滚。

**内演进靠列差集而不是靠"重来"**：`ALTER` 成功、PG 提交失败时，列已经在库里了。下一次提交同一份声明，差集算出来是空，不会重复 `ALTER`；这也顺带满足 D3 §2.5「列已存在直接报错」的例外——**同一个声明重放不算冲突**。若库里有一列既不在当前声明、也不在任何历史版本里，那是别人动的，报「结构不一致」。

**版本号分配**：`max(version) + 1`，靠 `@@unique([modelCode, version])` 与 `IotModelVersion_modelCode_active_key` 兜底并发。冲突时返回 409，不重试——重试会让"两个并发发布"变成"两个都成功"，而第二个必然基于过期的声明。

**减属性**：允许，版本照常发布，列保留在库里。D2 §11 的「物理一份、逻辑多版」就意味着这一点——声明里没有的属性，新数据不再上报，旧列留着不影响读。

**`dryRun=true`**：跑完校验与比对，把将要执行的 DDL 语句原样返回，**不写库、不执行**。这也顺带解决了「人肉拼 JSON 看不到后果」的代价（D3 §2.1）。

**响应**：`{ modelCode, version, status, warnings, ddl }`。`warnings` 取 S3 的 `ModelWarning`（今日只有 `service-not-implemented`）。

**DTO 只做浅层**：请求体用 `class-validator` 校验 `modelCode` 必填、三个数组存在；深层一律交给 `validateModel`——八档判别字段用装饰器表达会变成一整页 `@ValidateIf`，且与 S3 的校验器重复。

**错误响应的 `data` 形状**（不新增数字码，见 §7）：

| 情形 | HTTP | code | data |
| --- | --- | --- | --- |
| 声明结构非法 | 400 | `VALIDATION_FAILED` | `{ issues: ModelIssue[] }` |
| 某个 key 的 kind 变了 | 400 | `VALIDATION_FAILED` | `{ issues: [{ path, code: 'kind-changed' }] }` |
| 并发发布撞唯一约束 | 409 | `CONFLICT` | `{ reason: 'version-conflict' }` |
| 表 / 列已存在，或结构与声明不符 | 409 | `CONFLICT` | `{ reason: 'table-exists' \| 'schema-mismatch', tables: string[] }` |

### 2.6 T6 设备档案注册接口

`POST /api/v1/iot/devices`，请求体 `{ localDeviceId, modelCode, protocolVersion? }`。**`deviceId` 不由调用方提供**——它是平台签发的（S0.5：平台侧标识不下发设备，模拟器与前端都不依赖它）。

```text
① 前置检查（只读，无副作用）
   · 同 localDeviceId 的 ACTIVE 设备已存在 ⇒ 幂等：
       当前模型与请求的 modelCode 一致，且本模型应有子表齐（有聚合集时 1 + 3；无聚合时只有 1）⇒ 返回首次结果
       表缺 ⇒ 409「结构不一致」，不自动补（D3 §2.4）
       模型不同 ⇒ 409「已注册在其它模型」——换型号不属 S4（归 D5 之后的换型路径）
   · 模型无 ACTIVE 版本 ⇒ 409
② 签发 deviceId：16 位，首字母字母、其余字母数字——**口径**与 `p1.ts` 一致，生成方式不同（P1 是序号确定性映射，注册是随机 + 唯一约束兜底重试）
③ 建子表：原始 1 + 降采样 3（无聚合模型则只有 1），逐张记入 createdTables
④ PG 事务：Device(ACTIVE) + Usage(open, toAt = null)
失败：DROP createdTables —— PG 里什么都不留
```

**幂等靠前置检查，不靠数据库**：唯一约束只在并发下兜底。并发时两个请求签发的是**不同**的 `deviceId`，子表名不同、不会互相撞；第二个会在 PG 事务里撞 `localDeviceId` 唯一约束，回滚后按 `createdTables` 删掉自己刚建的那套子表。

**`dryRun=true`**：与模型接口同形——跑完前置检查，返回将要建的表与 DDL，不建表、不写库。

**`deviceId` 进表名与标签值，必须有字符集保证**：`subtableName(modelCode, deviceId)` 把它拼进表名，`TAGS ('...')` 把它拼进 DDL；`MAX_MODEL_CODE_LENGTH = 172` 也是按「表名 192 预留 `_{deviceId}` 17 字符」算的。签发函数保证 `^[A-Z][A-Z0-9]{15}$`，另加一道 `checkDeviceId` 作防御——它拦的是从库里读回的脏数据，不是正常路径。

**错误响应的 `data` 形状**：

| 情形 | HTTP | code | data |
| --- | --- | --- | --- |
| 模型无 ACTIVE 版本 | 409 | `CONFLICT` | `{ reason: 'model-not-active', modelCode }` |
| 档案存在但非 ACTIVE | 409 | `CONFLICT` | `{ reason: 'device-not-active', status }` |
| 档案 ACTIVE 但表缺 | 409 | `CONFLICT` | `{ reason: 'schema-mismatch', tables: string[] }` |
| 同 `localDeviceId` 已注册在别的模型 | 409 | `CONFLICT` | `{ reason: 'registered-to-other-model', modelCode }` |
| 并发撞唯一约束 | 409 | `CONFLICT` | `{ reason: 'duplicate-device' }` |

### 2.7 失败清理与告警（T5 / T6 共用）

两个接口共用一套清理：按 `createdTables` **逆序** DROP，只删本次建的。

⚠️ 模型内演进第 ④ 步（为已有设备补建降采样子表）**不进 `createdTables`**：它跑在版本切换之后，失败不回滚、已建成的也不删。它自己的失败处理见 §2.5。

| 步骤 | 失败时 |
| --- | --- |
| 单张 `DROP` | 有限次重试、间隔递增——TDengine 短暂不可用是极少数情况 |
| 重试仍失败 | 记 error 日志（表名清单、模型编码、设备自填编号），继续删下一张 |
| 全部删完仍有残留 | 由审计报 `orphanRaw` / `orphanDs`——审计只读、无删除路径，正好兜住这一层 |

**不做告警通道**：server 现在没有，接入告警系统是独立的事。本增量落 error 日志 + 审计兜底；同一表名反复出现在 error 日志里时，才是告警该出现的地方。

### 2.8 T7 测试

**单测**（`src/modules/iot/**/*.spec.ts`，不连库）：

| 用例 | 断言 |
| --- | --- |
| 原始列推导 | 六档 + enum + struct 各自的列类型与 `VARCHAR(n)` 宽度 |
| 缺 `varcharLength` | 返回 `missing-varchar-length`，不回落默认值 |
| DDL 列序 | 属性按声明顺序、聚合按固定顺序 |
| 无聚合模型 | 三张降采样语句为空数组 |
| DDL 不带 `IF NOT EXISTS` | 生成语句里不出现该短语 |
| 版本比对 | kind 变了拒绝；纯新增放行；减属性放行；同一声明重放算出的待加列为空 |

**e2e**（`test/iot-registration.e2e-spec.ts`，真 PG + 真 TDengine）：

| 用例 | 断言 |
| --- | --- |
| 新模型 + 第一台设备 | `SHOW TABLES` 见超表、子表、三张降采样表；PG 见 Model/Version/Device/Usage |
| 同模型第二台设备 | 模型的表不动，多一张子表 |
| 模型内演进（加属性） | 超表与三张降采样超表各多出对应列；旧版本 `SUPERSEDED`、新版本 `ACTIVE` |
| 幂等 | 同一请求重放，表数与行数不变 |
| 引用非 ACTIVE 模型 | 409，不建表 |
| 表已存在 | 先手工建一张同名子表，注册报错且 PG 不留档案行，**手工建的那张不被删** |
| 失败后重试 | 制造一次失败（占住表名）后清掉障碍，用同一 `localDeviceId` 重新提交 ⇒ 成功 |
| dryRun | 返回 DDL，库里没有新表 |
| 无聚合模型 | 只建超表与子表，`SHOW TABLES` 无降采样表 |
| 聚合从无到有 | 先注册一个全无聚合的模型与一台设备，再加一个带 `sum` 的属性 ⇒ 三张降采样超表**被建出来**，该设备的三张降采样子表也被补建 |
| 补建可重放 | 上一条的补建步骤再跑一次，不产生重复表、不报错 |
| 某一级降采样表缺列 | 手工删掉 1h 的 `sum_pressure` 后重放同一份声明 ⇒ 只对 1h 产出 `ALTER`，1m / 1d 不重复加列 |

**清理纪律**：每个用例的模型编码带 `e2e_reg_` 前缀，`afterAll` 先 `DROP TABLE`/`DROP STABLE` 再删 PG 行。D3 §3 的硬约束 2——e2e 不得假设可以清库。

⚠️ 跑这套 e2e 前先 `docker compose stop worker`：worker 的降采样环会扫所有超表，测试建出来的表会让它重算到不存在的数据。

### 2.9 T8 文档

- `backend.md`：iot 域从"四张档案表"扩为"档案 + 注册路径"；`IotDevice` / `IotModelVersion` 的状态枚举改为两态 / 三态
- `docs/governance/iot-stage-map.md` §2 与 `2026-11-01-backlog-triage.md` 里的状态枚举同步（`ACTIVE/FAILED` → `ACTIVE/SUPERSEDED`）
- `contracts.md`：补注册接口的错误 `data` 形状（§2.5 / §2.6），**不新增数字码**
- `repo-structure.md`：`device-registry` 的职责从"命名 + 校验"扩为"命名 + 校验 + 列类型 + 设备标识"
- 任务 README：S4 状态与验收证据

## 3. 顺序与验收

```text
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

T1 必须最先：四个命名函数不进包，server 就得自己写一套表名。

| 验收 | 怎么证明 |
| --- | --- |
| 判据 C（结构性） | 注册一台含 BOOL 与枚举测点的新类型设备，`SHOW TABLES` 与 `DESCRIBE` 全部由模型生成，`git status` 无 diff |
| 降采样跟着模型走 | 只给 `temperature` 声明 `sum`，超表只有 `sum_temperature` 一个降采样列 |
| 聚合从无到有 | 全无聚合的模型加上一个带 `sum` 的属性后，三张降采样超表与已有设备的三张子表都被补出来 |
| 模型内演进 | 加一个属性后，原始超表与三张降采样超表各多出对应列；已有数据不丢 |
| 拒绝路径 | 非法档位 / 改 key 的 kind / 引用非 ACTIVE 模型 / 表已存在 → 明确错误码，不落半条数据 |
| 失败可认领 | 手工占住一张子表名后注册，PG 不留档案行，审计能报出残留表 |
| 失败可重试 | 注册失败后，用同一 `localDeviceId` 重新提交能成功（失败不占身份） |
| 幂等 | 同请求重放两次，表数与行数不变 |
| 门禁 | `pnpm check`、`pnpm doc:lint`、server 单测与 e2e 全绿 |

**S4 交付后新模型的设备还收不了数据**：worker 的 detection 与写入器仍按 `RAW_METRICS` 三测点写死，读到不认识测点的报文的处理归 S5。判据 C 是结构性断言（表与列由模型生成），不依赖数据通路。验收时不要拿"新设备上报能落库"当标准。

## 4. 危险动作

| 动作 | 影响 | 闸 |
| --- | --- | --- |
| 在 server 里执行 DDL | 建表不可逆；`CREATE STABLE` 一旦成功就留下超表 | 先用 `dryRun` 打印语句人工过一遍；e2e 在独立模型编码前缀上跑 |
| 手写第二条 partial unique index | 与 S2 那条同形态，写错在执行时才报 | 迁移前在 scratch 库上跑一遍；索引名与列名逐字核对 |
| 拆分版本状态枚举 | `ALTER COLUMN ... TYPE` 会重写该列；库里若有新枚举里不存在的值，迁移失败 | 迁移前 `SELECT DISTINCT status FROM "IotModelVersion"`；今日只有 `ACTIVE` 一种 |
| 迁移时表里已有两个 ACTIVE 版本 | 索引建不上 | 迁移前查一次；有问题先人工收敛，不自动挑一个删 |
| server 新增 TDengine 连接 | 与 worker 并列持连接；`uncaughtException` 处理器被摘 | 懒连接，首次用到才建；摘 handler 的代码必须在模块加载最早期 |
| 失败清理 DROP 表 | 删错会把别人的表删掉 | 只删 `createdTables` 里逐张记下的名字，不按前缀匹配、不做"看起来像我们建的"推断 |
| 模型内演进补建设备子表 | 设备多时这一步耗时长；中途失败会让部分设备有降采样表、部分没有 | 失败不回滚版本切换，记录 + 告警，审计报 `missingDs`；补建只建缺的，可重复执行 |

## 5. 不做

- 注销、删除、`deviceId` 回收 → D5 / S6
- worker 读档案、detection 取模型量程 → D1 / S5
- 结构体序列化与写入侧校验 → S5
- 权限点与前端界面 → 增量 4
- `ops:tdengine-init` 的补齐脚本改造：它仍按 P1 三测点写死，与 server 的推导逻辑重复。**触发点**：补齐脚本需要支持新模型时，改为读档案 + 复用 server 的 DDL 生成。在此之前它是 dev-only 工具，不进测试/生产恢复路径（D3 §3）
- `deviceId` 的业务语义（批次 / 产线编码等）：S4 只定格式与生成方式

## 6. 改动面清单

| 文件 | 改什么 |
| --- | --- |
| `packages/device-registry/src/naming.ts` | 新增：四个命名函数 + `DS_LEVELS` / `DsLevel` |
| `packages/device-registry/src/column-type.ts` | 新增 `rawColumnOf` 与列问题码 |
| `packages/device-registry/src/device-id.ts` | 新增：签发 `deviceId` + `checkDeviceId` |
| `packages/device-registry/src/model-types.ts` | `VersionStatus` 去 `FAILED`、加 `SUPERSEDED`；删 `isTerminalStatus` |
| `packages/device-registry/src/index.ts` | 导出新模块 |
| `apps/iot-worker/src/schema.ts` | 删四个命名函数与 `DsLevel`，改为从包 import |
| `apps/iot-worker/{scripts,src/downsample,src/subtables}/*.ts` | 改 import |
| `apps/nestjs-server/prisma/schema.prisma` | 两个状态枚举：设备两态、版本三态 |
| `apps/nestjs-server/prisma/migrations/<ts>_iot_version_status/` | 枚举拆分 + 一条 partial unique index |
| `apps/nestjs-server/src/config/env.schema.ts` | 新增 `TDENGINE_URL` |
| `docker-compose.yml` | server 服务传 `TDENGINE_URL` |
| `apps/nestjs-server/src/modules/iot/tdengine/*` | 连接与 provider |
| `apps/nestjs-server/src/modules/iot/schema/ddl.ts` | DDL 生成 |
| `apps/nestjs-server/src/modules/iot/models/*` | controller / service / dto |
| `apps/nestjs-server/src/modules/iot/devices/*` | controller / service / dto |
| `apps/nestjs-server/src/modules/iot/iot.module.ts` | 装配新 provider |
| `apps/nestjs-server/prisma/seed.ts` | 版本状态改用新枚举（`p1` v1 仍是 `ACTIVE`） |
| `apps/nestjs-server/test/iot-registry.e2e-spec.ts` | 同上，随枚举类型调整 |
| `apps/nestjs-server/test/iot-registration.e2e-spec.ts` | 真库 + 真 TDengine e2e |
| `docs/architecture/backend.md` / `contracts.md` / `repo-structure.md` | 见 §2.9 |
| `docs/tasks/.../README.md` | 状态与证据 |

**核对过、确认不改**：`packages/contracts`（错误码复用现有 `BizCode`）、四张档案表的结构（S2 已定）、`DeviceRegistry` 接口。

## 7. 本计划做的判断（可否决）

| 判断 | 理由 | 否决的后果 |
| --- | --- | --- |
| **两个接口**：`POST /iot/models` 与 `POST /iot/devices` 分开 | 模型可以先于设备存在（D3 §2.3 明说这是常态）；两条状态机的失败清理各管各的 | 合成一个接口后，「新模型 + 第一台设备」的失败要跨两条状态机回滚，而超表按 D3 又不能跟着设备回滚 |
| **D3 时序图描述的是联动，不是单请求** | 图里两条状态机先后 ACTIVE，分开两次调用同样满足 | 若原意是单请求，需要重画那张图 |
| 模型发布失败时**删本次建的超表** | 模型行没写进去，超表就是无主物。D3 §2.5 的"超表不删"针对的是**设备**注册失败——那时模型已 ACTIVE | 留下无人认领的超表，审计按 ACTIVE 档案推导，认不出它属于谁 |
| `deviceId` 由**平台签发**，接口不接收 | 它进表名与标签值，是平台侧标识（S0.5）；调用方没有生成它的依据 | 调用方得自己造编号，等于把标识生成规则下放，且校验只能靠接口兜底 |
| 内演进按**列差集**判断要不要 ALTER | `ALTER` 成功而 PG 提交失败时，列已经在库里；按差集算则重放为空，不会撞"列已存在" | 按"声明 vs 快照"判断会重复 ALTER，而 DDL 不带 `IF NOT EXISTS`，重放必失败 |
| 不新增业务错误码，复用 `BizCode` + `data` 结构 | 现有码段按 HTTP 语义分段，iot 的细分错误都是 4xx 语义；新增数字码会让 contracts 包按业务域膨胀 | 调用方要靠 `data` 里的结构区分错误，不如数字码直观 |
| 幂等判断要查 TDengine（表齐不齐） | D3 §2.4 的边界就是"档案 ACTIVE 但表缺一张不算已注册" | 只查 PG 会把结构不一致判成成功 |
| 减属性允许、列不退 | D2 §11 的物理一份、逻辑多版 | 拒绝减属性会让"声明写错了"无法纠正，只能新建模型 |
| `rawColumnOf` 与 `AGGREGATE_COLUMN_TYPE` 同文件 | 两张表都在回答"什么档位落什么列"，分开就会各自漂 | 分开放后，改一处忘了另一处，原始列与降采样列对不上 |
| **拆成两个状态枚举**，设备两态、版本三态 | 设备永远不会有"退役"这一态；共用枚举让类型分不出"这个状态对设备有没有意义" | 加一个值省一次迁移，但类型撒谎，读代码的人要额外记住"这个值只对版本有效" |
| `PENDING` 留在枚举里，但**本增量不产生** | 注册失败不落库，PG 里只会有 `ACTIVE` 行；留着是因为异步化（D3 §5 的复查触发点）要用它 | 删掉后若注册改成异步，要再改一次枚举 |
| 失败**不落库**，重试天然可行 | D3 §2.5：整个注册过程失败即回滚，`localDeviceId` 不被占用 | 落一行 FAILED 会让同一设备永远无法重注册，除非再改唯一约束 |
| 降采样超表**逐级按现有列差集**决定加列 | 原始超表与 1m 加列成功、1h 失败时，原始列差集已为空；只看调用方传入的 `added` 会让缺失的一级永远补不上 | 每级先 `DESCRIBE STABLE` 再算差集，重放天然幂等 |
| 补建设备子表**失败不回滚模型发布** | 版本切换是模型自己的事；设备子表缺了由审计报 `missingDs`，补建可重放 | 回滚会让"模型改好了但一台设备补建失败"变成整个发布失败 |


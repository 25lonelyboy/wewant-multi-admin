---
status: living
covers:
  - packages/contracts/
  - apps/nestjs-server/src/
  - apps/pure-web/src/api/
  - apps/pure-web/mock/
last_verified: 2026-08-28
---

# contracts 契约包

## 定位与约束

- `packages/contracts`（`@multi-admin/contracts`）是前后端接口契约的唯一载体：响应信封、错误码、分页与各域 VO/DTO 类型。nestjs-server（Nest，ESM）与 pure-web（Vite；mock fixture 同形标注）双端消费。
- 只放**纯类型与常量值**（如 BizCode / MenuType 枚举对象）；不放运行期逻辑、校验规则（class-validator DTO 留 server 侧）与框架依赖。
- 构建为 tsdown ESM+CJS 双格式 + 双 d.ts（`format: ['esm', 'cjs']`，`dts: true`），应对 Vite / Nest（`type: module`）/ jest（CJS）三种消费场景。
- 消费方一律 `workspace:*` 引用；消费方的 typecheck / test / build 任务经 `turbo.json` 的 `^build` 先构建 contracts，防陈旧产物参检（决策见 ADR-005）。

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
| CONFLICT | 40900 | 唯一约束冲突 |
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

---
status: accepted
---

# ADR-004：前后端契约走独立 contracts 包与后端技术栈选型

## 背景

P4 收尾时 NestJS 后端基架完成（认证链 + system RBAC CRUD + 测试门禁）；P5 要求 pure-web 脱离 mock 直连。前后端类型同步机制、Nest ESM 与 jest CJS 的双消费形态，以及后端技术栈的最终确认需要记录。

## 决策

1. **新建 `packages/contracts` 承载接口契约**（纯类型 + BizCode/MenuType 常量值），tsdown ESM+CJS 双格式 + 双 d.ts；双端 `workspace:*` 消费 + typecheck 前置构建。
   - 否决备选：① 前端 codegen 复制类型——双源漂移风险，无编译期绑定；② 前端直接消费 server 包导出的类型——拖入 Nest 依赖树与 ESM/CJS 解析问题。
2. **ORM 选 Prisma 7**（ESM-only + driver adapter，无引擎二进制）。否决 Drizzle：当时其关系查询与迁移工具链成熟度不及 Prisma，团队 Prisma 经验更多。
3. **认证自研 JWT 双令牌 + Redis 轮换/吊销**，不引入 Lucia：Lucia 已于 2025 停止维护，继续依赖违背可持续性判据。
4. **DTO 校验用 class-validator**（NestJS 生态默认）而非 zod：server 端校验与框架管道耦合；zod 仅用于 config env 校验（启动期一次性）。
5. **直连口径**：P5 前端直连真实后端；mock 保留为离线数据源（契约同形）；dept / 监控 / mine-logs 后端不实现，前端降级并登记 backlog。
6. **对齐机制**：contracts 先行扩展流程与错误码码段规则写入 `docs/architecture/contracts.md`；server 域契约一致性单测钉住序列化形态。

## 影响

- packages/ 层出现第一个被真实消费的共享包（common 仍无消费方）。
- 前后端类型漂移在编译期暴露（双端 typecheck）；信封 / 错误码 / 分页形状单一来源。
- 后续域（dept / 监控）实施必须走 contracts 先行流程。

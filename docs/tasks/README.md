# 任务过程材料（热索引）

大任务、大阶段、专项治理或跨模块调研的过程材料目录。**每任务一行，只列进行中 + 最近已完成**。

## 进行中

| 任务 | 收口说明 |
|---|---|
| pure-web 测试基建与 strict 类型安全 | 总体设计已定稿（批次 A0 上游基线 → A strict 迁移 → B vitest 基建与模块测试）；批次 A0/A+B0/B1 已合并 master 验收通过；B1（纯函数组）7 提交实施完成（14 spec 文件、strict 清单 6→31 项含 print.spec.ts 防御性纳入、print.ts 架构性豁免），覆盖率 glob 阈值经审查修复为 vitest 4 顶层键形式后 13 键真实生效；B2（状态机/store 组）、B3（在用组件组）批次设计已定稿；见 [2026-08-29-pure-web-testing-foundation/](2026-08-29-pure-web-testing-foundation/) |

## 最近已完成

| 任务 | 收口说明 |
|---|---|
| server 镜像启动冒烟（Tier 2） | 合并 master、CI 首跑四 job 全绿（CI 构建即测：/health 探针 + entrypoint 三段断言 + job services 双依赖，server-smoke.sh 本地/CI 同源）；backlog 已关闭并登记演进行；结论 → [build-and-verify.md](../engineering/build-and-verify.md)；已归档 [archive/2026-08-28-server-image-smoke/](archive/2026-08-28-server-image-smoke/) |
| 生产安全基线（Tier 2 #6） | 7 提交已合并 master（非 root + digest pin 8 处 + check-digests 巡检 + 运行链 3 项修复）；backlog ①② 已关闭；结论 → [build-and-verify.md](../engineering/build-and-verify.md)；已归档 [archive/2026-08-27-server-security-baseline/](archive/2026-08-27-server-security-baseline/) |
| 登录限流账号维度与失败锁定（Tier 2） | 6 提交已合并 master（42301 契约 + LoginLockService/Guard + validateUser 插桩 + e2e 三用例）；backlog 条目已关闭并登记管理员解锁端点；错误码 42301 → [contracts.md](../architecture/contracts.md)，限流行为 → [backend.md](../architecture/backend.md)；已归档 [archive/2026-08-27-login-account-lockout/](archive/2026-08-27-login-account-lockout/) |
| Server 基建速赢（Tier 1） | 4 项改动 + 2 fix 已合并 master；backlog 相关条目已关闭；信封/请求链/数据库新行为同步 → [backend.md](../architecture/backend.md)、[contracts.md](../architecture/contracts.md)；已归档 [archive/2026-08-26-server-infra-quickwins/](archive/2026-08-26-server-infra-quickwins/) |
| ops 脚本自动化操作集 | 7 个脚本落地；结论 → [build-and-verify.md](../engineering/build-and-verify.md)；已归档 [archive/2026-08-25-ops-scripts/](archive/2026-08-25-ops-scripts/) |
| GitHub CI 落地 | 四 job 异步安全网 + DATABASE_URL 修复；决策 → [ADR-006](../decisions/ADR-006-github-ci.md)；已归档 [archive/2026-08-23-github-cicd/](archive/2026-08-23-github-cicd/) |
| Turborepo 构建编排全量迁移 | 5 提交完成 turbo.json 任务图取代 pre hook + 门禁纯校验化 + Docker 拓扑修复；决策 → [ADR-005](../decisions/ADR-005-turbo-build-orchestration.md)，工程实践 → [build-and-verify.md](../engineering/build-and-verify.md)；过程原件已移入 [archive/2026-08-23-turbo-build-orchestration/](archive/2026-08-23-turbo-build-orchestration/) |
| NestJS 后端基架补全（P1-P5） | 五阶段全部完成；契约包事实源 → [contracts.md](../architecture/contracts.md)，技术选型 → [ADR-004](../decisions/ADR-004-contracts-and-backend-stack.md)，待跟进项 → [governance/backlog.md](../governance/backlog.md)；过程原件已移入 [archive/2026-08-16-nestjs-backend-foundation/](archive/2026-08-16-nestjs-backend-foundation/) |
| 仓库基架与桌面端阶段 1 | 结论已提升至 `docs/architecture/` 与 `docs/engineering/`，稳定决策落为 ADR-001/002/003；过程原件已移入 [archive/2026-08-12-repo-foundation-and-desktop/](archive/2026-08-12-repo-foundation-and-desktop/) |

## 规则

- 新任务建目录 `docs/tasks/<YYYY-MM-DD>-<短名>/`，过程文件（plan / decisions / verification / retrospective）同用日期前缀，只追加不改写。
- 收口时把结论提升到事实源、稳定决策写成 ADR，本 README 更新为一行记录。
- 完成超 90 天或结论提升完毕的任务移入 `archive/`（建目录时同步建冷索引）。
- 小任务不建目录，可复用结论直接写入事实源。

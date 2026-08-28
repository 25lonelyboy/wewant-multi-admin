# 任务过程材料（热索引）

大任务、大阶段、专项治理或跨模块调研的过程材料目录。**每任务一行，只列进行中 + 最近已完成**。

## 进行中

| 任务 | 说明 |
|---|---|
| 生产安全基线（Tier 2 #6） | 容器非 root（`USER node`）+ 镜像 digest pin（8 处 tag@digest）+ check-digests 刷新兜底脚本；设计 → [design.md](2026-08-27-server-security-baseline/2026-08-27-server-security-baseline-design.md) |
| server 镜像启动冒烟（Tier 2） | CI 构建即测：run 已构建镜像 + /health 探针断言，本地 server-smoke.sh 同源改造；设计 → [design.md](2026-08-28-server-image-smoke/2026-08-28-server-image-smoke-design.md) |

## 最近已完成

| 任务 | 收口说明 |
|---|---|
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

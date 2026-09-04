# 决策记录（ADR）

架构决策的唯一存放地。只收录不可逆、影响模块边界或含真实权衡的决策；可随时回退的小决定不写 ADR。

## 索引

| ADR | 决策 | 状态 |
|---|---|---|
| [ADR-001-electron-desktop.md](ADR-001-electron-desktop.md) | 桌面端技术选型 Electron（打印需求导向） | accepted |
| [ADR-002-dependency-catalog.md](ADR-002-dependency-catalog.md) | 依赖版本统一走 pnpm catalog + named catalog 隔离 | accepted |
| [ADR-003-electron-toolchain-pin.md](ADR-003-electron-toolchain-pin.md) | Electron 工具链精确 pin（构建编排条款由 ADR-005 取代；pin 决策继续有效故不标整体 superseded） | accepted |
| [ADR-004-contracts-and-backend-stack.md](ADR-004-contracts-and-backend-stack.md) | 前后端契约走独立 contracts 包；Prisma / 自研 JWT 认证 / class-validator 选型 | accepted |
| [ADR-005-turbo-build-orchestration.md](ADR-005-turbo-build-orchestration.md) | 构建编排采纳 Turborepo 任务图（取代 pre hook；部分取代 ADR-003 编排条款） | accepted |
| [ADR-006-github-ci.md](ADR-006-github-ci.md) | GitHub CI 异步安全网（报警式不拦截，单人直推工作流兜底；决策时四 job，现增 `coverage-web` 共五） | accepted |
| [ADR-007-backend-evolution.md](ADR-007-backend-evolution.md) | 后端演进方向：长期模块化单体 + 终态微服务分段路线（D1-D4 与阶段 A 范围决策） | accepted |

## 规则

- 命名：`ADR-<三位序号>-<短横线主题>.md`，frontmatter 只要求 `status` 字段（accepted / superseded / rejected）。
- ADR 是不可变记录：决策变更不修改原文，新增 ADR 并把旧 ADR 标记为 `superseded`、注明接替者。
- 决策的实施细节与当前行为写在 architecture / engineering 事实源，ADR 只记录背景、权衡与结论。

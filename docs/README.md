# 工程文档索引

本文件是 `docs/` 文档体系的总索引与维护规则入口。

## 读取顺序

1. 根 `AGENTS.md`（agent 任务）或根 `README.md`（人类上手）
2. 本文件
3. 与任务相关的领域入口，如 `docs/architecture/README.md`
4. 领域下的最小主题文件
5. 仅当事实源无答案时进入 `docs/tasks/` 热区；仅显式追溯时进入 `docs/tasks/archive/`

按需读取，不要求通读。文档是索引，代码是事实源；文档结论将影响决策时，先以最小成本核对代码或配置。

## 目录职责

| 目录 | 职责 | 当前状态 |
|---|---|---|
| [architecture/](architecture/README.md) | 当前架构事实、模块边界、不变量、安全约束 | 有事实源 |
| [engineering/](engineering/README.md) | 可复用工程实践、构建与验证命令、依赖与兼容性结论 | 有事实源 |
| [decisions/](decisions/README.md) | 架构决策记录（ADR），跨域决策唯一存放地 | 已有 3 篇 ADR |
| [tasks/](tasks/README.md) | 大任务/阶段/专项治理的过程材料（热索引 + archive） | NestJS 后端基架补全收尾中 |
| product/ | 业务规则、角色、权限、术语表 | 暂无内容，待有业务文档时再建 |
| operations/ | 部署、环境、CI/CD、观测 | 暂无内容（部署事实暂由代码内注释承载） |
| [governance/](governance/README.md) | 全局 backlog 登记册 | 已建立（P5）；文档体系维护规则仍在本文件 |

## 维护规则

- **事实源唯一**：同一事实只在一个文件维护，其余位置放链接；新建文件前先检查现有主题能否承载。
- **归位与登记**：新文档必须放进对应层目录，并登记进该目录 README 索引；不允许孤儿文件。
- **事实只写已验证行为**：未落地的意图只能写入 `tasks/` 的计划文档或 ADR，不进事实源。
- **过程材料隔离**：大任务在 `docs/tasks/日期-任务名/` 建目录，过程文件只追加不改写；收口时把结论提升到事实源、稳定决策写成 ADR；完成超 90 天移入 `archive/`。
- **命名**：活文档用稳定语义名（如 `repo-structure.md`）；不可变过程记录与任务目录用日期前缀（如 `2026-08-16-task-name/`）；存量旧命名不强制迁移。
- **新鲜度**：活文档在头部声明 frontmatter——`status`（living / snapshot / deprecated）、`covers`（描述的代码路径）、`last_verified`（最后核对属实日期）。文档与代码不一致时采信代码并修复文档；`deprecated` 文档只作线索，不直接引用结论。
- **docs-in-same-commit**：改变已文档化行为的代码变更，必须在同一提交内更新对应文档。
- **安全红线**：文档禁止写入密钥、token、账号密码、内网地址；需要引用时用占位符 `<redacted>`。

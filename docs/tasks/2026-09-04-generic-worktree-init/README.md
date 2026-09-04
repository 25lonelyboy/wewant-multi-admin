# 通用 worktree 初始化脚本

- **状态**：进行中（设计已确认，待实施）
- **目标**：将 `scripts/worktree-init.ps1`（未跟踪、Windows 限定）改造为通用零依赖的 `scripts/ops/worktree-init.sh`，覆盖 worktree 检出后初始化与新克隆仓库引导两个场景。

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-09-04-generic-worktree-init-design.md](2026-09-04-generic-worktree-init-design.md) | 设计文档（8 项锁定决策 + 五步链架构 + 验收用例，含同日审查修正） |
| [2026-09-04-generic-worktree-init-plan.md](2026-09-04-generic-worktree-init-plan.md) | 实施计划（6 任务，按函数分节增量构建 + 五组验收） |

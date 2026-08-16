# 架构事实

本目录是仓库架构事实的唯一事实源：系统边界、模块职责、构建依赖关系、不变量与安全约束。

## 主题索引

| 文档 | 内容 |
|---|---|
| [repo-structure.md](repo-structure.md) | monorepo 结构、各 workspace 边界与构建依赖关系、目录放置规则 |
| [desktop-app.md](desktop-app.md) | Electron 桌面端架构：进程结构、自定义协议、托盘常驻、IPC 安全不变量、打包链 |

## 不写在这里的内容

- 工程命令与环境步骤 → `docs/engineering/`
- 决策过程与权衡 → `docs/decisions/`（ADR）
- 任务过程材料 → `docs/tasks/`

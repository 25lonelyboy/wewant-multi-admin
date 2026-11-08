---
status: living
last_verified: 2026-11-08
---

# 运维与部署

本目录承载部署、环境与运行维护事实；CI job 与质量门禁仍在 `docs/engineering/build-and-verify.md`。

## 索引

| 文档 | 内容 |
|---|---|
| [deployment.md](deployment.md) | Docker 镜像、compose 服务、env 注入、暴露面、镜像 pin 与非 root、迁移 / seed、健康检查 |
| [ops-scripts.md](ops-scripts.md) | `scripts/ops` 与 `scripts/probe`：命令、职责、前置依赖、一次性迁移、脚本约束 |

## 边界

- 质量门禁、CI job、各端构建链与测试分层 → `docs/engineering/`
- 架构事实、模块边界与不变量 → `docs/architecture/`
- 任务过程材料 → `docs/tasks/`

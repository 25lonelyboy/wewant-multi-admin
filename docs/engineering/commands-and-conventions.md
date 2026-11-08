---
status: living
covers:
  - package.json
  - pnpm-workspace.yaml
  - turbo.json
  - commitlint.config.mjs
  - .husky/
  - scripts/
last_verified: 2026-11-08
---

# 命令速查与协作约定

本文件是仓库级命令与协作约定的入口。构建机制、质量门禁与依赖判据分别见 [build-and-verify.md](build-and-verify.md) 与 [dependency-catalog.md](dependency-catalog.md)；应用内命令与入口见文末「应用入口」表。

## 常用命令

```bash
pnpm install
pnpm dev:web / dev:server / dev:mobile / dev:desktop / dev:sim
pnpm build
pnpm build:web / build:desktop
pnpm check
pnpm lint / typecheck
pnpm format / format:check
pnpm doc:lint
```

- `pnpm check`：Prettier 全量检查 → turbo typecheck / lint / stylelint → turbo test → 测试覆盖枚举；纯校验不改文件。
- `pnpm build:desktop`：任务图先构建 pure-web，再编译 Electron 主进程与 preload。
- 本地依赖服务：`pnpm ops:env-up` / `ops:env-down`；镜像冒烟 `ops:smoke` / `ops:server-smoke`。

## 单文件测试

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts
pnpm --filter @multi-admin/pure-web run test -- src/utils/auth.spec.ts
pnpm --filter @multi-admin/iot-worker run test -- test/detection.test.ts
```

全仓入口 `turbo run test:e2e --filter=<包名>` 与 `pnpm --filter <包名> run test:e2e` 等价；前者经 turbo 任务图。

## Commit scope 白名单

提交信息必须带 scope，白名单与仓库结构对应：

| scope | 适用范围 |
|---|---|
| server | apps/nestjs-server |
| web | apps/pure-web |
| mobile | apps/uni-mobile |
| desktop | apps/electron-desktop |
| common | packages/common |
| internal | internal/* |
| repo | 根工程与跨应用治理 |
| deps | 依赖升级 |
| release | 发版 |
| docs | 文档 |

规则实现见 `commitlint.config.mjs`，由 `commit-msg` 钩子执行。

## 任务图与环境透传

turbo `envMode` 为 strict，只有 `turbo.json` 声明的变量会传给任务子进程。涉及 Prisma 的任务声明 `DATABASE_URL`；测试与开发任务追加 `REDIS_URL`、`MQTT_URL`、`QUEUE_REDIS_URL`。机制与门禁分层见 [build-and-verify.md](build-and-verify.md)。

## 文档验收

文档变更后执行 `pnpm doc:lint`；读取顺序与维护规则见 [docs/README.md](../README.md)。

## 应用入口

| 应用 | 应用级文档 |
|---|---|
| nestjs-server | [apps/nestjs-server/AGENTS.md](../../apps/nestjs-server/AGENTS.md) |
| pure-web | [apps/pure-web/AGENTS.md](../../apps/pure-web/AGENTS.md) |
| iot-worker | [apps/iot-worker/AGENTS.md](../../apps/iot-worker/AGENTS.md) |

`apps/uni-mobile`、`apps/electron-desktop`、`apps/iot-simulator` 暂无应用级 AGENTS；入口见根 [README.md](../../README.md) 与 [repo-structure.md](../architecture/repo-structure.md)。

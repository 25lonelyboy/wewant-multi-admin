---
status: living
covers:
  - scripts/
  - .husky/
  - .lintstagedrc.json
  - apps/pure-web/Dockerfile
  - apps/nestjs-server/Dockerfile
  - docker-compose.yml
last_verified: 2026-08-17
---

# 构建与验证

命令速查见根 `AGENTS.md`；本文写门禁机制与构建链约束。

## 质量门禁（无 CI 的替代）

仓库无 CI/CD，提交质量由两层本地机制保证：

1. **`pnpm check`**（`scripts/check.mjs`）：按序执行 Prettier 全量检查 → 全 workspace typecheck → lint → test（`--if-present`），任一失败立即非零退出。提交前必跑。
2. **husky 钩子**：`pre-commit` 跑 lint-staged（配置在 `.lintstagedrc.json`，只处理暂存文件）；`commit-msg` 跑 commitlint（scope 强制 + 白名单，见 `commitlint.config.mjs`）。

注意 pnpm 生命周期钩子按**精确脚本名**匹配变体（`prebuild` 与 `prebuild:dir` 需各自声明），改脚本名时同步检查钩子是否仍生效。

## 各端构建链

| 端 | 构建 | 说明 |
|---|---|---|
| pure-web | `vite build`（NODE_OPTIONS 加大内存） | 产物 `dist/` + `version.json`；staging 模式 `build:staging` |
| nestjs-server | `nest build` | 产物 `dist/` |
| uni-mobile | `uni build`（按平台加 `-p`） | H5 / 小程序多目标 |
| electron-desktop | prebuild（触发 pure-web build）→ esbuild → electron-builder | 链路细节见 `docs/architecture/desktop-app.md` |

## Lint / 格式化职责分离

- **ESLint / Stylelint 只校验**，应用侧配置是引用 `internal/eslint-config` / `internal/stylelint-config` 工厂的薄壳；lint 统一 `--max-warnings 0`。
- **格式化由 Prettier 独占**（根 `.prettierrc.js` + `.prettierignore`）；不要在 ESLint/Stylelint 里开格式化规则。

## Docker

- **构建 context 必须是仓库根**：`docker build -f apps/pure-web/Dockerfile .`（Dockerfile 内部已按 manifest 分层缓存 + `--filter @multi-admin/pure-web...` 依赖隔离安装）。
- 基础镜像 `node:24-alpine`，pnpm 版本经 corepack 按 `packageManager` 字段锁定；镜像变量用 `PNPM_CONFIG_REGISTRY` / `COREPACK_NPM_REGISTRY`（`npm_config_*` 对 pnpm 无效）。
- 本机编排：`cp .env.example .env` 填写 `POSTGRES_PASSWORD` 与 `ADMIN_INIT_PASSWORD` 后 `docker compose up`（postgres + redis + server + web 四服务；server 依赖 postgres/redis 双健康，启动链 entrypoint 串 `prisma migrate deploy → prisma db seed → exec node`，幂等可重复）。库名统一 `multi_admin`；存量旧卷（旧库名初始化）需 `docker compose down -v` 重建。

## 已知环境事实

- Windows 下 Electron 打包期可能出现 `dist-electron/` EPERM 文件锁：确保无残留 electron 进程后重跑。
- pnpm 安装含构建脚本的依赖受 `pnpm-workspace.yaml` 的 `allowBuilds` 白名单控制，新增需构建的原生依赖时要登记。

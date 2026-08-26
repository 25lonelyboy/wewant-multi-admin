---
status: living
covers:
  - pnpm-workspace.yaml
  - .npmrc
last_verified: 2026-08-26
---

# 依赖治理：pnpm catalog 策略

版本唯一事实源是 `pnpm-workspace.yaml`（catalog / named catalog / overrides）与各包 `package.json`，本文只写判据与机制。

## 入 catalog 判据（满足任一条）

1. **≥2 个 workspace 包消费**（或明确即将共享）。
2. **框架级 / 工具链级依赖**：版本漂移会直接引发运行错误（如 vue 生态、与 Vite 大版本强耦合的插件）。
3. **被刻意固定版本**（无 `^`）：pin 的理由需要在工作区层面可见。

三条都不满足的依赖留在应用本地 `package.json`。目标是**消除多消费者之间的版本分歧**，不是 catalog 覆盖率。

## 分类法（新增依赖时对号入座）

| 类别 | 判定 | 动作 | 例子 |
|---|---|---|---|
| A | 框架核心 + 明确共享候选 | 立即入 catalog | vue-router、pinia、axios、dayjs |
| B | 与已有 catalog 项大版本强耦合 | 随工具链收敛入 catalog | @vitejs/plugin-vue 全家桶、tailwindcss 族 |
| C | 需先收敛到共享包 | 先并入 internal 包再入 catalog | ESLint 插件并入 `internal/eslint-config` |
| D | 单一消费者、跟随上游模板、pin 有局部上下文 | 留在应用本地 | pure-admin 模板的 UI 组件库 |

## Named catalog 隔离

uni-app 编译链与主仓 Vite 大版本不兼容：主仓走 `catalog:`（Vite 8），uni-mobile 单独引用 `catalog:uni-app`（Vite 5.2.8）。**版本大不兼容时用 named catalog 隔离，不强行统一。**

## Pin 策略

- **Electron 生态**（electron / electron-builder / esbuild 编译链相关）在 `apps/electron-desktop/package.json` 精确 pin、不加 `^`：升级需整链评估（主进程 API、打包二进制、协议行为联动）。
- **jest 30.4.1** 被 catalog + 根 `package.json` 的 `overrides`（jest / jest-runtime / jest-circus / jest-mock / expect / jest-snapshot 全家）双重强制，避免 NestJS 生态拉入不兼容版本。
- **istanbul 三库**（istanbul-lib-coverage 3.2.2 / istanbul-lib-report 3.0.1 / istanbul-reports 3.2.0）为 `apps/nestjs-server` 本地 devDependencies 精确 pin（D 类：单消费者不入 catalog）；版本与 jest 传递依赖一致，零新下载，决策见 P4 分设计 §7。
- catalog 中已 pin 的包保持 pinned，不擅自补 `^`。

## 反模式（禁止）

- 把依赖搬到根 `package.json` 靠 hoisting 共享——产生幻影依赖。
- 为"统一"强行合并大版本不兼容的依赖。
- 绕过 `internal/*` 共享包直接把 lint 插件散装进各应用。

## 镜像与网络

根 `.npmrc` 已集中配置：npmmirror registry、Electron 二进制镜像（`electron_mirror`）、electron-builder 打包二进制镜像（`electron_builder_binaries_mirror`）、fetch 超时与重试。应用脚本内如需覆盖，用 `ELECTRON_BUILDER_BINARIES_MIRROR` 环境变量（见桌面端打包脚本）。

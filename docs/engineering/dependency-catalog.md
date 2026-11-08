---
status: living
covers:
  - pnpm-workspace.yaml
  - .npmrc
last_verified: 2026-11-08
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
| A | 框架核心 + 明确共享候选 | 立即入 catalog | vue-router、pinia、axios、dayjs、`mqtt`（设备接入客户端：nestjs-server 订阅、iot-simulator 发布，两端消费） |
| B | 与已有 catalog 项大版本强耦合 | 随工具链收敛入 catalog | @vitejs/plugin-vue 全家桶、tailwindcss 族 |
| C | 需先收敛到共享包 | 先并入 internal 包再入 catalog | ESLint 插件并入 `internal/eslint-config` |
| D | 单一消费者、跟随上游模板、pin 有局部上下文 | 留在应用本地 | pure-admin 模板的 UI 组件库 |

## Named catalog 隔离

uni-app 编译链与主仓 Vite 大版本不兼容：主仓走 `catalog:`（Vite 8），uni-mobile 单独引用 `catalog:uni-app`（Vite 5.2.8）。**版本大不兼容时用 named catalog 隔离，不强行统一。**

## Pin 策略

- **Electron 生态**（electron / electron-builder / esbuild 编译链相关）在 `apps/electron-desktop/package.json` 精确 pin、不加 `^`：升级需整链评估（主进程 API、打包二进制、协议行为联动）。
- **express `^5.0.0`** 入主 catalog：NestJS 11 依赖 express 5，框架级核心按判据 2 入 catalog（当前仅 nestjs-server 消费），避免未来多消费者分歧。
- **jest 30.4.1** 被 catalog + `pnpm-workspace.yaml` 的 `overrides`（jest / jest-runtime / jest-circus / jest-mock / expect / jest-snapshot 全家）双重强制，避免 NestJS 生态拉入不兼容版本。
- **pure-web 本地仍声明 `mqtt` 4.3.7**（当前源码无 import），与 catalog 的 `mqtt` 5.x 并存；属待清理项，登记于 [backlog](../governance/backlog.md)。
- **istanbul 三库**（istanbul-lib-coverage 3.2.2 / istanbul-lib-report 3.0.1 / istanbul-reports 3.2.0）为 `apps/nestjs-server` 本地 devDependencies 精确 pin（D 类：单消费者不入 catalog）；版本与 jest 传递依赖一致，零新下载。
- **`@tdengine/websocket` 3.5.0** 入主 catalog（两处消费：`apps/iot-worker` 的 TDengine 连接器 + `apps/nestjs-server` 的 STMT 探针脚本）。
  它是 TDengine 的官方 WebSocket 连接器，[ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md) 已定该客户端。**精确 pin 而非 `^`**：连接器的实际 API 面与官方文档不一致（见数据链路阶段第 2 项 §10 的实测），钉住被实测过的那个版本。
- **`bullmq` `^6.3.12`** 入主 catalog（两处消费：`apps/nestjs-server` 的生产者 + `apps/iot-worker` 的消费者）；MIT，缓冲层选型见 [ADR-010](../decisions/ADR-010-ingest-buffer-bullmq.md)。**不 pin**：官方语义稳定，按常规 `^` 跟随小版本。
- **`allowBuilds` 显式关闭 `bufferutil` / `utf-8-validate` / `msgpackr-extract`**：`bufferutil` / `utf-8-validate` 是 `ws` 的可选原生加速模块，`msgpackr-extract` 是可选原生加速包；关闭后自动退到 JS 实现——避免在 CI / Docker 里引入 node-gyp。
  ⚠️ pnpm 安装时会把未决项写成占位串（`set this to true or false`），**必须替换成明确布尔值**，否则 `pnpm-workspace.yaml` 是坏值。
- **`minimumReleaseAgeExclude` 目前只列 `@nestjs/swagger@11.4.7`**，主开关 `minimumReleaseAge` 未启用；它是单条例外而不是通用策略。
- catalog 中已 pin 的包保持 pinned，不擅自补 `^`。

## 反模式（禁止）

- 把依赖搬到根 `package.json` 靠 hoisting 共享——产生幻影依赖。
- 为"统一"强行合并大版本不兼容的依赖。
- 绕过 `internal/*` 共享包直接把 lint 插件散装进各应用。

## 镜像与网络

根 `.npmrc` 已集中配置：npmmirror registry、Electron 二进制镜像（`electron_mirror`）、electron-builder 打包二进制镜像（`electron_builder_binaries_mirror`）、fetch 超时与重试。

应用脚本内如需覆盖，用 `ELECTRON_BUILDER_BINARIES_MIRROR` 环境变量（见桌面端打包脚本）。

# wewant-multi-admin

![CI](https://github.com/25lonelyboy/wewant-multi-admin/actions/workflows/ci.yml/badge.svg) <!-- 访问日期 2026-10-05：指向本仓库 CI 工作流 -->

多端管理后台与 IoT 平台 monorepo（pnpm workspace）：Web 管理后台、NestJS 后端、uni-app 移动端、Electron 桌面端、设备模拟器与遥测消费者，共享 internal 工具包与 contracts / device-registry / common 共享包。

## 快速开始

环境要求：Node >=24、pnpm >=11（`engines` + `engine-strict` 强制校验）。

```bash
pnpm install        # 安装依赖
pnpm dev:web        # Web 管理后台（缺省直连后端，VITE_MOCK=true 切离线 mock）
pnpm dev:server     # NestJS 后端
pnpm dev:mobile     # 移动端 H5
pnpm dev:desktop    # Electron 桌面端
pnpm dev:sim        # 设备模拟器（MQTT 上行遥测）
pnpm check          # 本地质量门禁（prettier / typecheck / lint / stylelint / test）
```

## 目录导航

| 路径                       | 说明                                                  |
| -------------------------- | ----------------------------------------------------- |
| `apps/pure-web`            | Vue3 管理后台（vue-pure-admin 基底）                  |
| `apps/nestjs-server`       | NestJS 后端服务                                       |
| `apps/uni-mobile`          | uni-app 多端应用                                      |
| `apps/electron-desktop`    | Electron 桌面端                                       |
| `apps/iot-simulator`       | 设备模拟器（MQTT 上行遥测）                           |
| `apps/iot-worker`          | 遥测消费者（BullMQ → TDengine）                       |
| `packages/contracts`       | 前后端与设备接入契约                                  |
| `packages/device-registry` | 存储侧词汇、物模型与档案快照类型                      |
| `packages/common`          | 跨端共享代码                                          |
| `internal/*`               | eslint / stylelint / tsconfig / node-utils 内部工具包 |

## 文档

工程文档索引见 [docs/README.md](docs/README.md)（架构事实、工程实践、决策记录、任务过程材料的分层入口）。

---
status: living
covers:
  - apps/electron-desktop/
last_verified: 2026-08-16
---

# Electron 桌面端架构

## 进程结构

```text
apps/electron-desktop/
  electron/main/        主进程：index.ts（入口）/ window.ts / tray.ts / protocol.ts / ipc/
  electron/preload/     preload：index.cjs（CJS 格式，sandboxed 环境要求）
  esbuild.config.mjs    主进程 + preload 编译（TS → dist-electron/）
  electron-builder.yml  打包配置（图标需 build/ 与 assets/ 双位置维护）
  scripts/dev.mjs       dev 启动编排
```

主进程启动链（`electron/main/index.ts`）：

1. `protocol.registerSchemesAsPrivileged` 注册自定义协议（`standard` + `secure` + `supportFetchAPI`）
2. `app.requestSingleInstanceLock()` 单实例锁；二次启动仅唤起已有主窗口
3. `whenReady` 后依次：注册协议处理器 → 注册 IPC handler → 创建窗口 → 创建托盘

## 渲染层托管：自定义协议

桌面端**不复用** `file://` 或内嵌 HTTP 服务，而是用自定义协议（scheme 见 `electron/main/protocol.ts` 的 `SCHEME`）托管 pure-web 构建产物：

- 协议在 `registerSchemesAsPrivileged` 中声明为 `secure`，避免混合内容限制。
- 生产环境从打包资源目录解析 pure-web 的 `dist/`；preload 必须为 CJS（sandboxed renderer 限制）。

## 托盘常驻行为

- 关闭主窗口仅隐藏，应用驻留托盘；托盘菜单提供"显示 / 退出"。
- `window-all-closed` 在非 darwin 平台仍会退出（兜底：窗口真正销毁而非隐藏时）。

## IPC 安全不变量

- **preload 仅暴露具名方法**（白名单 API），**禁止** `ipcRenderer` 泛通道透传给渲染层；新增能力 = 在 preload 增加具名方法 + 主进程增加对应 handler + `types/ipc.d.ts` 补类型声明。
- IPC 返回的类型形状必须与 preload 暴露的声明一致（如 versions 形状）。

## 打包链

```text
pnpm build:desktop
  → prebuild: pnpm --filter @multi-admin/pure-web run build   # 编排上游产物
  → esbuild.config.mjs                                          # 编译主进程/preload
  → electron-builder（--dir 可跳过安装包制作，仅产出目录）
```

- electron / electron-builder 版本**精确 pin**（当前 43.4.0 / 26.15.7，见 `apps/electron-desktop/package.json`），升级需整链评估。
- 打包期二进制（NSIS、winCodeSign 等）通过镜像下载：`.npmrc` 的 `electron_builder_binaries_mirror` + 脚本内 `ELECTRON_BUILDER_BINARIES_MIRROR` 环境变量（npmmirror）。
- Windows 环境打包时若 `dist-electron/` 被进程占用会出现 EPERM 文件锁，重跑前确保无残留 electron 进程。

## 版本信息注入

跨包版本信息（如 pure-web 的 `version.json`）在**构建期**经 define/生成文件注入，运行时不做跨包读取——修改版本展示逻辑时先查各端 build 脚本。

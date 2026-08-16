---
status: accepted
date: 2026-08-14
---

# ADR-003 Electron 工具链精确 pin 与构建编排位置

## 背景

Electron 升级常伴随主进程 API、打包器行为、二进制下载源的联动变化；且仓库无 CI，版本漂移只能在本地暴露，排障成本高。同时桌面端打包依赖 pure-web 产物，存在"谁先构建"的编排问题。

## 决策

1. **Electron 生态依赖精确 pin**（electron、electron-builder 等，无 `^`），升级必须整链评估后一次性更新。
2. **跨应用构建编排放在桌面端 `prebuild` 钩子**（`pnpm --filter @multi-admin/pure-web run build`），而不是根脚本或 pure-web 钩子：保证任何入口（根 `build:desktop` 或包内直接执行）都得到完整产物链。
3. 打包期二进制走 npmmirror 镜像（`.npmrc` + `ELECTRON_BUILDER_BINARIES_MIRROR` 环境变量），规避国内网络失败。

## 被否决的替代方案

- 根脚本编排：单独在 `apps/electron-desktop` 内执行构建时会被绕过，产生不完整产物，被否决。
- `^` 范围版本：Electron 补丁版也曾出现行为回退，且锁文件无法约束新增安装场景，被否决。

## 影响

版本变更属 `deps` scope 提交；`prebuild` 与 `prebuild:dir` 等脚本变体需各自声明钩子（pnpm 按精确脚本名匹配）。

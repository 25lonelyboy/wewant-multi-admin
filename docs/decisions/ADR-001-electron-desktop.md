---
status: accepted
date: 2026-08-12
---

# ADR-001 桌面端技术选型 Electron

## 背景

管理后台需要桌面端形态，核心驱动是**打印需求**（含 POS/小票打印机生态、静默打印、系统打印对话框深度集成）。

## 权衡

| 候选 | 优势 | 劣势 |
|---|---|---|
| **Electron**（选定） | Node 生态可直连打印 SDK 与串口/USB 外设；Chromium 打印 API 完整；团队心智与 Web 端一致 | 包体大、内存占用高 |
| Tauri | 包体小、资源占用低 | WebView 不统一导致打印行为分叉；Rust 侧打印生态需自建，对接成本高 |

## 结论

采用 Electron。桌面端不重写 UI：通过自定义协议托管 `pure-web` 构建产物作为渲染层（实施事实见 `docs/architecture/desktop-app.md`），主进程只承载窗口、托盘、IPC 与系统能力。

## 影响

- 桌面端引入 Electron 工具链版本治理约束（见 ADR-003）。
- 打印等系统能力一律走"主进程 handler + preload 具名方法"，不进渲染层。

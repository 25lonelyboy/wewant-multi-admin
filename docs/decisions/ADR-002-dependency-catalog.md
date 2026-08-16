---
status: accepted
date: 2026-08-14
---

# ADR-002 依赖版本统一走 pnpm catalog

## 背景

多端 monorepo（4 应用 + internal 工具包）中同一依赖散落在各 package.json，版本漂移会直接造成运行错误（尤其 vue / vite 生态）；uni-app 的 Vite 5.2.8 与主仓 Vite 8 大版本不兼容。

## 决策

1. 多消费者 / 框架级 / 刻意 pin 的依赖统一进 `pnpm-workspace.yaml` 的 `catalog:`，应用侧用 `catalog:` 引用。
2. 版本大不兼容时用 **named catalog 隔离**（`catalogs.uni-app` 钉住 uni-mobile 的 Vite 5.2.8），不强行统一。
3. jest 30.4.1 用 catalog + overrides 双重 pin，阻断 NestJS 生态传递依赖拉入不兼容版本。
4. 单消费者依赖留在应用本地，禁止靠根 package.json hoisting 共享。

## 被否决的替代方案

- 根 package.json 集中声明 + hoisting：产生幻影依赖，被否决。
- 全量入 catalog：覆盖率无意义，单一消费者依赖上提只增加耦合，被否决。

## 影响

判据与分类法（A/B/C/D）是硬规则，落地细节见 `docs/engineering/dependency-catalog.md`；新增依赖必须先过判据。

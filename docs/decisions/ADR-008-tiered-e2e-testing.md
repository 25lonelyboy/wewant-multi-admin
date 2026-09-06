---
status: accepted
date: 2026-09-06
---

# ADR-008 双层 E2E 测试策略：前端集成（mock）+ 真实后端冒烟

## 背景

CI `e2e-web` job 跑 `VITE_MOCK=true`（`vite-plugin-fake-server`），但 P5 决策已锁定 pure-web **直连真实后端**为生产现实（`VITE_MOCK=false` 时 `/api/v1` 代理至 NestJS，mock 降级为离线开关）。由此产生三个问题：

1. **生产链路从未被前端 E2E 验证**：浏览器→proxy `/api/v1`→NestJS→postgres/redis 的真实接线、真实信封 runtime 形状、真实双令牌轮换、真实 CORS，均不在 mock E2E 覆盖内。
2. **mock-only E2E = false-green**：mock 与真实后端行为漂移时，9 个绿 mock 测试会掩盖集成断链——正是社区反复警告的「不要被覆盖率高的 E2E 迷惑」。`packages/contracts` 提供编译期形状绑定，但抓不到 runtime 行为漂移（BizCode、时序、轮换语义、锁定阈值）。
3. **前端大量调整后直连健康度未知**：B1-B4 strict 迁移 + 组件测试重构改动了大量前端代码，此后直连链路是否仍完好，mock E2E 无从暴露。

## 决策

采纳**双层 E2E**（对齐 Testing Trophy「真 E2E = full stack + real DB + user-observable outcome」与社区 80/20 共识）：

1. **Tier A 前端集成 E2E（mock，保留现有 9 test）**：正名为「浏览器级前端集成测试」（**非真 E2E**），每 push 报警式（现有 `e2e-web` job），覆盖 UI 旅程 + T4 canvas 回补 + 边缘渲染，约 80% 大头，快 / 确定 / 并行安全。
2. **Tier B 真实后端 E2E 冒烟（新增）**：against 真实 nestjs + postgres + redis（`VITE_MOCK=false`），合 master / nightly 报警式（新增 `e2e-web-real` job），小集（3-5 test）：登录、用户管理 CRUD 代表旅程、token 真实轮换（BizCode 40102）、账号锁定 42301 前端处理，约 20% 信心层，验 mock 永远验不了的生产接线。
3. **双模切换**：同一套 Playwright 代码经 env 切后端（`E2E_MODE` / `VITE_MOCK` / 凭证 env 化）；tag 分流（`@mock-only` / `@real-backend`），Playwright `--grep` 选层跑，避免测试代码翻倍。
4. **契约桥接不引 Pact**：`packages/contracts` 编译期形状绑定 + Tier B runtime 行为验证互补即可；真实后端已可跑，Pact 基建过重（YAGNI）。
5. **Tier B flaky 缓解**：串行 `workers:1` + 用例边界重置共享态（flushdb）+ 专用 test seed，复用 nestjs-server e2e 已验证范式（见 build-and-verify.md「共享全局状态集成测试串行」教训）。
6. **Tier B 用 GH Actions services 起后端**（postgres + redis，沿用 coverage job 的 digest pin），非 runner 内 `docker compose up`——与 ADR-006 一致，services 是一等公民。

## 被否决的替代方案

| 方案 | 否决理由 |
| --- | --- |
| 维持纯 mock E2E（现状） | false-green：生产接线从未验证；与 P5 直连决策矛盾；社区明确警告「被覆盖率迷惑」 |
| 全换 real-backend E2E | 慢 / flaky / 需 env 编排，每 push 不现实；canvas 回补等纯前端关注点无需真后端；违背 80/20 与 Trophy「E2E 小顶层」 |
| 引 Pact / Specmatic 契约测试 | 基建重；真实后端已可跑，Tier B real 冒烟即务实 runtime 桥；「契约测试大厂用、现阶段 YAGNI」 |
| Tier B 每 push 触发 | 太慢 / flaky，拖累快反馈环；报警式低频（合 master / nightly）契合项目 CI 哲学 |
| Tier B runner 内 `docker compose up` | 对齐 ADR-006：services 是一等公民（健康检查 / 端口映射），与 test env 默认值零改动对齐 |
| token 轮换降级为纯 T1 单测（不做 Tier B） | mock 永远验不了真实双令牌轮换时序；三层各验各的不可塌缩（T1 逻辑 + Tier A 编排 + Tier B 真实语义） |

## 影响

- 新增 `.github/workflows/ci.yml` `e2e-web-real` job（报警式，合 master / nightly，services postgres + redis + server 启动链）。
- `e2e/` 双模改造：`loginAsAdmin` 凭证 env 化（`auth.spec.ts` 硬编码 `admin/admin123` 必改）+ baseURL 切换 + tag 分流。
- 新增 Tier B 冒烟 3-5 test；Tier A 现有 9 test 保持（部分标 `@mock-only`）。
- 落地细则（Tier A/B 定义、双模机制、tagging、触发频率、强制旅程清单）写入 living 规范 `docs/engineering/frontend-testing-standard.md`；本 ADR 只记决策理由与权衡。
- 落地 P5「直连真实后端」决策的测试验证面；首个动作为直连回归探针（`VITE_MOCK=false` 跑通登录），兼验前端大量调整后 P5 接线是否完好。
- 设计全貌见 [2026-09-06-frontend-testing-standard-design.md](../tasks/2026-09-06-frontend-testing-standard/2026-09-06-frontend-testing-standard-design.md)。

# pure-web 测试基建与治理审查复盘

> 2026-09-04 补记：任务收口时未建复盘文件（治理审查发现），本文件补沉淀本任务链（A0–B4 实施 + 2026-09-02 治理审查 + 2026-09-04 经验收口）中值得归档的可复用经验。设计为快照，不随后续演进更新。

## 一、测试基建可复用经验（后续加测试时先查本节）

### vitest / 覆盖率

1. **TSX spec 静默跳过**：`vitest.config.ts` 的 `include` 必须显式匹配 `.spec.tsx`，只写 `.spec.ts` 时 TSX 测试不执行也不报错。新增组件测试（TSX 写法）前先核对 include。
2. **降阈是纪律红线**：覆盖率缺口一律补测试用例，禁止把 `thresholds` 调低绕过（B4 审查曾发现 4 处 `branches: 80 → 60` 违规，已全部修复恢复）。
3. **Canvas / jsdom 不可达行为**：按「薄测试逻辑分支 + 豁免双向登记 + 不给覆盖率阈值键」口径处理（print.ts 先例，ReImageVerify / ReCropperPreview / ReQrcode 沿用）；深度行为由 E2E 层回补。
4. **fake-server 与测试文件冲突**：`vitePluginFakeServer({ include: 'mock' })` 会把 mock 目录下的测试文件当路由模块加载，需在插件 `exclude` 排除 `mock/*.spec.ts`。

### 测试写法

5. **禁止整模块 mock 被测依赖**：`@/utils/auth` 的 `hasAuth` / `hasPerms` 本身是 ReAuth / RePerms 的测试对象，spec 中保持真实模块。
6. **豁免移出与迁入同提交**：组件移出豁免清单必须与迁入 strict 配置在同一提交闭环，避免窗口期口径不一致。

### Playwright E2E

7. **等待真实信号，不用宽泛 glob**：`waitForURL('**/#/**')` 会立即命中登录页自身（`/#/login`），导致在动态路由注册完成前继续执行。404 兜底路由用例的正确等待信号是 `router.hasRoute('PageNotFound')`（`waitForFunction` 轮询）；未知路由导航用客户端 `router.push` 避免 `page.goto` 整页刷新与 `initRouter()` 的竞争。

### 计划与盘点

8. **计划数字双重实测校验**：静态盘点系统性低估错误量（组件盘点 46 → 实测 94 个 strict 错误）。计划中的数字必须由全量工具实测 + 逐文件求和两条独立路径交叉验证后才能写入。

## 二、文档治理经验（2026-09-02 审查产出，部分已提升为维护规则）

9. **基建引入必须同提交更新 AGENTS.md**：B0–B4 全部提交未同步测试命令，导致入口文档陈旧（"目前仅 nestjs-server 有 jest 基建"）。测试 / 构建 / 部署基建落地时，命令速查同步是 docs-in-same-commit 硬规则的直接适用面。
10. **活文档不随任务归档**：`upstream-baseline.md` 自声明活文档且被周期性机制持续消费，随任务归档后每轮巡检都要显式追溯冷区；已提升为 [upstream-tracking.md](../../../engineering/upstream-tracking.md)（living + covers 漂移检测保护）。判据：文档被持续性机制消费 → 提升到事实源层。
11. **索引行写定性结论不写精确计数**：热 / 冷索引中的「963 单测」类数字随测试增长立即陈旧；索引豁免新鲜度管理，但数字不在豁免语义内。已改为「单测 / E2E 全绿」表述。
12. **归档目录必须有内层 README**：冷索引不能替代任务目录自身的入口——防误读防线 2（警告横幅）要求横幅在目录内 README 顶部。本次补齐 5 个归档目录（孤儿检查由 25 项清零）。
13. **CJS 脚本在 `"type": "module"` 仓库落盘须用 `.cjs`**：doc-lint 母版为 CJS，直接复制 `.js` 会报 `require is not defined`；副本落为 `scripts/doc-lint.cjs`，AGENTS.md 登记命令与文件名保持一致。
14. **复盘与收口动作要显式列入计划**：本复盘文件因收口计划未含复盘步骤而缺失，由外部审查补建。多批次任务的收口计划应包含「复盘文件 + 结论提升清单」两个检查项。

## 三、B4 审查修复备忘（防止同类回归）

审查发现并已修复的 5 项 Important：fake-server 加载 mock.spec 报错（→ 经验 4）；routing.spec 404 恒真断言（→ 经验 7）；menu 域 boolean/number 口径半迁移；约 65 行显式 any 类型债（收敛为契约 VO 与本地展示类型）；monitor 四 hook 覆盖率降阈（→ 经验 2）。

## 结论提升去向

| 经验 | 去向 |
| --- | --- |
| 测试分层 / 覆盖率阈值 / E2E 命令 | [build-and-verify.md](../../../engineering/build-and-verify.md) |
| 上游基线长期维护机制 | [upstream-tracking.md](../../../engineering/upstream-tracking.md) |
| 治理规则（活文档归档判据 / 索引定性表述） | [docs/README.md 维护规则](../../README.md) |
| 已关闭 / 开放条目 | [backlog.md](../../../governance/backlog.md) |

## 四、补记（2026-09-04 提升复核）

经提升复核，经验 5（禁整模块 mock）与经验 7（E2E 等待真实信号）已提升为 [apps/pure-web/AGENTS.md 硬规则](../../../../apps/pure-web/AGENTS.md)（日常开发纪律）；「doc-lint 接入门禁链」作为运维治理决策项登记进 [backlog.md](../../../governance/backlog.md)。经验 6（豁免移出同提交）因最终态已删除豁免机制而过期，不再提升；架构层经复核无事实缺口（测试金字塔属工程实践，已由工程层与应用级 AGENTS.md 承载）。

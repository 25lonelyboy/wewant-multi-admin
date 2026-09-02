# pure-web 测试基建批次 B3 设计（在用组件组）

> 分批次设计文档：承接 [总体设计](./2026-08-29-pure-web-testing-foundation-design.md) 第 6 章 B3 行。[B1 设计](./2026-08-29-pure-web-testing-foundation-b1-design.md)、[B2 设计](./2026-08-29-pure-web-testing-foundation-b2-design.md) 已定稿；B3 实施前须满足 [前置依赖](#4-前置依赖与事实校准)。组件事实以 [A3 组件盘点](./component-inventory.md) 为准。

## 1. 范围与子任务拆解

B3 共 3 个子任务：组件测试基建沉淀 + **16 个在用组件**全部迁入（含 ReDrawer 移出豁免清单，A3 盘点修正）；8 个遗留组件维持豁免原状，处置留独立决策（总设计第 9 章）。数据来源：A3 盘点落档 + 设计期探查实测；strict 错误数经正式链（vue-tsc + tsconfig.strict 基座全组件文件）复验修正。

| 子任务 | 组件 | 规模（总行数，实测） | strict 错误（实测） |
| --- | --- | --- | --- |
| B3.1 | 测试基建 + 低复杂度 7 件：`ReCol` / `ReText` / `ReIcon` / `ReSegmented` / `ReAnimateSelector` / `ReCountTo` / `ReFlicker` | 29+76+4483+244+255+309+44 | 1+0+14+7+5+6+0 = 33 |
| B3.2 | 中复杂度 6 件：`ReAuth` / `RePerms` / `ReDialog` / `ReTypeit` / `ReImageVerify` / `ReDrawer`（新纳入） | 25+25+560+64+138+499 | 0+0+17+0+1+15 = 33 |
| B3.3 | 高复杂度 3 件：`RePureTableBar` / `ReCropperPreview` / `ReQrcode` | 474+83+268 | 24+4+0 = 28 |

关键判据（探查已证实）：

- **ReIcon 4483 行但逻辑薄**：9 文件中大头是图标数据（`data.ts` 与在线图标清单），`Select.vue` 为 35/页分页、三前缀筛选、复制的交互 UI——归 B3.1 依据「逻辑薄 + 数据可断言」而非行数
- **Canvas 家族共 3 件**：`ReImageVerify`（4 处 canvas 引用，B3.2）+ `ReCropperPreview` + `ReQrcode`（B3.3）——统一按 B1.7 print.ts 先例豁免绘制行为
- **strict 总负担 94 个错误分布于 10 件**（33+33+28），零错误仅 6 件（ReAuth / RePerms / ReFlicker / ReText / ReQrcode / ReTypeit）；其中 TableBar 24 含 5 个 `*.svg?component` 声明缺失（随基建第 2 节补声明后消失）；复盘口径：盘点 5.4 的 46 为旧口径未复现，已同步修正 component-inventory

## 2. 组件测试基建（B3.1 首动作，全批次前提）

| 基建项 | 方案 | 依据 |
| --- | --- | --- |
| 测试环境 | per-file `@vitest-environment jsdom`，config 全局维持 node | 已定稿决策（B2 app.ts 同口径）；B1/B2 存量 spec 零影响 |
| DOM 挂载 | `src/test-utils/`：mount helper（ElementPlus 全局插件 + ResizeObserver stub + pinia/路由按需注入） | 兑现 B1 风险表「真实插件基建留 B3.1」约定 |
| `~icons/*` 与 `*.svg?component` | `vitest.config.ts` alias 正则 → 统一 stub 组件 | 已定稿决策：组件测试断言自身行为，图标渲染不具断言价值 |
| 第三方边界 | sortablejs / typeit / rebound stub 薄测；@pureadmin/table、cropperjs、qrcode 内部不测 | 总设计 B3.3「只测容器与关键行为」原则 |
| `*.svg?component` 类型声明 | `tsconfig.strict.json` types 数组加 `"vite-svg-loader"`（该声明现仅依赖主 tsconfig include `build/plugins.ts` 的副作用，strict 链不含） | 正式链探针复验：缺声明时 TableBar 5 个 + import 链 layout/views 约 30 个 TS2307 |

基建验证方式：`src/test-utils/` 与首个最小组件测试（ReCol 或 ReFlicker）同时落地，兑现验证 mount helper 与 alias stub 后滚动其余组件。

## 3. 子任务测试策略

### 3.1 低复杂度 7 件

| 组件 | 断言要点 |
| --- | --- |
| `ReCol` | 原始标签渲染 / 组件映射渲染 + 1 个 strict 修复（index.ts TS2722） |
| `ReText` | 超长截断 + tippy 触发 |
| `ReIcon` | `data.ts` 导出完整性断言（导出数、id 结构、去重）全行执行；`Select.vue` 分页 / 筛选 / 复制交互 + 14 个 strict 修复（hooks 1 + iconifyIconOffline 2 + Select.vue 11） |
| `ReSegmented` | 内部排序 + 拖拽回调 + 7 个 strict 修复（index.tsx） |
| `ReAnimateSelector` | 动画容器事件透传 + 5 个 strict 修复（index.vue TS7053 ×5） |
| `ReCountTo` | 初始 / 目标值 + rebound 配置出入 + 6 个 strict 修复（normal 3 + rebound 3） |
| `ReFlicker` | 乱序内容渲染断言 |

### 3.2 中复杂度 6 件

| 组件 | 断言要点 |
| --- | --- |
| `ReAuth` / `RePerms` | 复用 B1.4 真实 `hasPerms` + B2 store 资产：授权 / 未授权双分支 + 无 slot 早退 |
| `ReDialog` | 打开 / 关闭状态机 + 17 个 strict 错误机械修复（index.vue 16 + index.ts 1） |
| `ReTypeit` | 实例创建 stub + 生命周期接线 |
| `ReImageVerify` | 输入校验流 + Canvas 绘制豁免（见 6） + 1 个 strict 修复（index.vue TS6133 domRef） |
| `ReDrawer` | closeAllDrawer 全局注册表 + 15 个 strict 错误机械修复（index.vue 14 + index.ts 1）；**移出豁免清单与迁入清单同一提交** |

### 3.3 高复杂度 3 件

| 组件 | 断言要点 |
| --- | --- |
| `RePureTableBar` | props / 插槽渲染 + sortable 重排回调 + 按钮组回调 + 24 个错误修复（19 类型错误 + 5 个 svg TS2307 随基建补声明消失） |
| `ReCropperPreview` / `ReQrcode` | 容器渲染 + 关键回调 + Canvas 绘制豁免（见 6）；CropperPreview 另含 4 个 strict 修复（index.vue） |

## 4. 前置依赖与事实校准

1. **B2 批次落盘**：ReAuth / RePerms 复用 B1.4 真实 `hasPerms` + B2 store 测试资产（pinia 测试注入、mock 边界约定）；RePureTableBar 依赖的 epTheme store 已有 B2.5 测试先例
2. **事实校准窗口**：本设计期数据经正式链复验（24 组件目录行数 + 94 个 strict 错误分布于 10 件，vue-tsc + tsconfig.strict 基座全组件文件，2026-08-30 审查修正）；计划编写时仅需复核「B1/B2 执行期间是否触碰过 `src/components`」（预期不触碰——两批次域均不含组件层）
3. **清单基线**：B3 开始时 `tsconfig.strict.json` 已含 B1+B2 全部资产；B3 各子任务按「组件域内全部 `ts/tsx/vue` + spec」追加迁入
4. **test-utils 落位**：`src/test-utils/` 在防漏断言枚举范围内，本身按 strict 零错误标准一并迁入清单
5. **豁免清单变更**：ReDrawer 移出豁免与迁入清单同一提交闭环（防漏断言对存量文件不拦截，同一提交消除窗口期）

## 5. 执行编排

- **模式**：串行单 worktree `feat/pure-web-testing-b3`（延续 B1/B2：worktree + subagent-driven）
- **顺序**：B3.1（基建 + 7 件）→ B3.2（6 件，含 ReDrawer）→ B3.3（3 件，Canvas 豁免登记）
- **每子任务节奏**：TDD 红→绿→重构；结束 = 组件 ≥80%（`vitest.config.ts` glob 键追加）+ strict 清零迁清单 + 独立提交（scope `web`）
- **B3.1 首动作**：`src/test-utils/` 基建 + 首个最小组件测试同时落地（见 2 基建验证方式）

## 6. 统一验收

| 项 | 内容 |
| --- | --- |
| 三件套平移 | ① 组件 ≥80% 行+分支（glob 键按序追加）② 组件域内文件+spec strict 零错误迁清单 ③ 独立提交 + 受影响文档同提交 |
| B3.2 附加 | ReDrawer 移出豁免清单 + 迁入清单 + 测试同一提交 |
| Canvas 豁免 | `ReImageVerify` / `ReCropperPreview` / `ReQrcode` 绘制行为按 B1.7 先例：薄测试逻辑分支 + 豁免清单双向登记（backlog 理由 / 时机；条目注释注明 Canvas 边界） |
| 遗留组件 | 8 件维持豁免原状，B3 不处置（独立决策任务另起） |
| 全局 | 防漏断言计数只增不减；`pnpm check` 全绿；ReDrawer 豁免条目 −1、Canvas 豁免条目 +3 |

继承总体设计第 7 章三件套（测试 ≥80% / strict 清零迁清单 / conventional commits + 文档同提交）。

## 7. 风险

| 风险 | 缓解 |
| --- | --- |
| ElementPlus 真实插件链在 jsdom 的行为差异（ElMessage 等 DOM 依赖） | B3.1 首个用例兑现验证；失败回退局部 `vi.mock`（延续 B1 message.ts 先例），不阻塞批次 |
| sortablejs / typeit / rebound 在 jsdom 不可靠 | 第三方内部 stub 薄测，断言组件自身接线与回调 |
| vitest alias 正则对 `*.svg?component` 的支持度 | B3.1 基建首个用例兑现验证；不可行则退化为 per-file `vi.mock` 虚拟模块 |
| strict 链缺 `*.svg?component` 类型声明（声明现仅靠主 tsconfig include `build/plugins.ts` 副作用生效） | 基建第 2 节：strict.json types 加 vite-svg-loader，消除 TableBar 5 个 + import 链约 30 个 TS2307（探针已复验） |
| ReIcon 4483 行覆盖率达标压力 | `data.ts` 导出完整性断言天然全行执行；`Select.vue` 聚焦交互分支 |
| ReDrawer 移出豁免的清单窗口期 | 与迁入同一提交闭环（前置依赖第 5 条） |
| Canvas 豁免被误判污染 | 理由 + 时机双向登记（backlog + 豁免清单条目注释） |
| B1/B2 执行期间触碰组件层源码 | 事实校准第 2 条：计划编写时复核 |

## 8. 文档治理

- 本文档：`docs/tasks/2026-08-29-pure-web-testing-foundation/`（同目录）
- 总设计第 6 章 B3 行已加链接 + 注明「B3.2 含 ReDrawer（A3 盘点修正：1 处 App.vue 引用）」
- `docs/tasks/README.md` 热索引同步
- backlog：Canvas 豁免 3 组件登记（B1.7 print.ts 同一格式）；遗留 8 组件处置条目已存（总设计第 9 章），无需新增
- 实施计划（writing-plans 产物）：`...-b3-plan.md` 同目录
- 收口：随总任务目录归档
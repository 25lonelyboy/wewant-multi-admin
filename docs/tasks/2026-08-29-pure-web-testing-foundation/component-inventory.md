# A3 组件盘点落档

> 盘点日期：2026-08-29
> 目标应用：`apps/pure-web`
> 组件目录总数：24
> 在用组件：16 ｜ 遗留组件：8
> 上游差异交叉验证：组件层无上游变更

---

## 1. 防倒退断言回归验证

对 `scripts/assert-strict-manifest.mjs` 进行探针测试：

| 步骤 | 操作 | 预期 | 实际 |
| --- | --- | --- | --- |
| 1 | 从 `tsconfig.strict.json` include 移除 `src/utils/tree.ts` | 断言失败 | ✖ 清单倒退（已迁入条目被移出）：`apps/pure-web/src/utils/tree.ts` |
| 2 | `git checkout` 恢复 `tsconfig.strict.json` | 断言通过 | ✔ strict 清单断言通过（清单 1 项 / 豁免 21 项 / 存量待迁移 195 项） |

**结论**：防倒退断言机制工作正常，能有效拦截已迁入文件被意外移除的回归。

---

## 2. 在用组件表

> 引用数统计方法：在 `apps/pure-web/src` 和 `apps/pure-web/mock` 下搜索组件目录名（单词匹配），
> 排除组件自身目录内的文件。`main.ts` 全局注册语句计入引用。

| # | 组件名 | 引用数 | 目录文件数 | 依赖复杂度 | strict 错误数 | 上游高危标记 |
| --- | --- | ---: | ---: | :---: | ---: | :---: |
| 1 | ReIcon | 22 | 9 | 重 | 14 | — |
| 2 | ReCol | 5 | 1 | 轻 | 1 | — |
| 3 | ReDialog | 5 | 3 | 轻 | 17 | — |
| 4 | RePureTableBar | 5 | 2 | 轻 | 24 | — |
| 5 | ReSegmented | 4 | 4 | 轻 | 7 | — |
| 6 | ReCropperPreview | 2 | 2 | 轻 | 4 | — |
| 7 | ReText | 2 | 2 | 轻 | 0 | — |
| 8 | ReAnimateSelector | 1 | 3 | 轻 | 5 | — |
| 9 | ReAuth | 1 | 2 | 轻 | 0 | — |
| 10 | ReCountTo | 1 | 7 | 中 | 6 | — |
| 11 | ReDrawer ⚠️ | 1 | 3 | 轻 | 15 | — |
| 12 | ReFlicker | 1 | 2 | 轻 | 0 | — |
| 13 | ReImageVerify | 1 | 3 | 轻 | 1 | — |
| 14 | RePerms | 1 | 2 | 轻 | 0 | — |
| 15 | ReQrcode | 1 | 3 | 轻 | 0 | — |
| 16 | ReTypeit | 1 | 2 | 轻 | 0 | — |

> ⚠️ ReDrawer：实测有 1 处外部引用（`App.vue` 中 `<ReDrawer />`），但同时被列入
> `tsconfig.strict.exemptions.json` 遗留豁免清单。§5 交叉验证结论已被 B3 批次设计采纳：
> B3.2 移出豁免（与迁入清单同一提交）。

### 依赖复杂度判定标准

- **轻**：1–3 个文件
- **中**：4–7 个文件
- **重**：8+ 个文件

---

## 3. 遗留组件表

> 遗留组件定义：外部引用数 = 0，已列入 `tsconfig.strict.exemptions.json`。

| # | 组件名 | 目录文件数 | strict 错误数 | 豁免状态 |
| --- | --- | ---: | ---: | :---: |
| 1 | ReBarcode | 2 | 0 | ✅ 已豁免 |
| 2 | ReCropper | 18 | 0 | ✅ 已豁免 |
| 3 | ReFlop | 4 | 0 | ✅ 已豁免 |
| 4 | ReSeamlessScroll | 3 | 30 | ✅ 已豁免 |
| 5 | ReSelector | 3 | 46 | ✅ 已豁免 |
| 6 | ReSplitPane | 10 | 0 | ✅ 已豁免 |
| 7 | ReTreeLine | 2 | 0 | ✅ 已豁免 |
| 8 | ReVxeTableBar | 2 | 11 | ✅ 已豁免 |

**遗留组件文件合计**：44 个文件

### 遗留组件说明

- ReSelector（46 错误）和 ReSeamlessScroll（30 错误）虽然 strict 错误数较高，但因零引用已被豁免，不构成迁移阻塞。
- ReCropper 目录含 18 个文件（含大量 SVG 图标），体积最大但零错误、零引用。
- ReSplitPane 含 10 个文件，结构相对复杂，但同样零引用。

---

## 4. 上游差异交叉验证

### 数据来源

- `conflict-surface.txt`：上游与下游存在差异的文件清单
- `upstream-changed.txt`：上游发生变更的文件清单

### 验证结果

| 检查项 | `src/components/` 匹配数 |
| --- | ---: |
| conflict-surface.txt | **0** |
| upstream-changed.txt | **0** |

### 上游差异文件全量

**conflict-surface.txt**（4 项）：

- `build/plugins.ts`
- `build/utils.ts`
- `package.json`
- `vite.config.ts`

**upstream-changed.txt**（9 项）：

- `.nvmrc`
- `build/info.ts`
- `build/plugins.ts`
- `build/utils.ts`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `vite.config.ts`

**结论**：上游差异完全集中在构建工具链（build/、package.json、vite.config.ts）和项目配置层，
**组件层无任何上游变更或冲突**。组件迁移工作不受上游分支干扰，可独立推进。

---

## 5. 交叉验证结论

### 5.1 数量校验

| 指标 | 设计预期 | 实测值 | 说明 |
| --- | --- | ---: | --- |
| 在用组件数 | ~15 | **16** | ReDrawer 实测有 1 引用（App.vue），计入在用 |
| 遗留组件数 | ~9 | **8** | 同上，ReDrawer 从遗留移至在用 |

### 5.2 ReDrawer 双重身份

ReDrawer 同时出现在：

1. **引用搜索结果**：App.vue 中有 `<ReDrawer />` 组件使用及 `import` 语句（引用数 = 1）
2. **tsconfig.strict.exemptions.json**：作为遗留组件被豁免

可能原因：豁免清单基于「纯展示型根级容器、无业务页面直接使用」的判定，
但 App.vue 作为全局容器确实引用了它。建议后续评估是否将其从豁免清单移除。

### 5.3 上游安全

上游差异文件（conflict-surface.txt 4 项 + upstream-changed.txt 9 项）中
**无任何 `src/components/` 路径匹配**，组件层迁移不存在上游合并风险。

### 5.4 strict 错误分布

- 在用组件中 **10 个组件** 存在 strict 错误，合计 94（正式链复验 2026-08-30，测法见下）：ReAnimateSelector（5）、ReCol（1）、ReCountTo（6）、ReCropperPreview（4）、ReDialog（17）、ReDrawer（15）、ReIcon（14）、ReImageVerify（1）、RePureTableBar（24，其中 5 个为 `*.svg?component` 类型声明缺失，随 B3 基建补 vite-svg-loader 声明后消失）、ReSegmented（7）
- 零错误 **6 个组件**：ReAuth、ReFlicker、RePerms、ReQrcode、ReText、ReTypeit
- 遗留组件中 **3 个组件** 存在 strict 错误：ReSelector（46）、ReSeamlessScroll（30）、ReVxeTableBar（11），合计 87 个错误（已被豁免；豁免件数字未复验，维持原口径）
- 复验测法：临时探针 extends `tsconfig.strict.json`（正式链基座，含 noUnusedLocals/noUnusedParameters）+ `vue-tsc --noEmit` include 全组件文件；统计限定 `src/components/` 路径（探针已删）。原始盘点口径未记录测量法，46 系旧口径，本节数字以复验为准

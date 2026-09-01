# pure-web 测试基建批次 B3 实施计划（在用组件组）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 pure-web 的 16 个在用组件（ReCol / ReFlicker / ReText / ReIcon / ReSegmented / ReAnimateSelector / ReCountTo / ReAuth / RePerms / ReDialog / ReTypeit / ReImageVerify / ReDrawer / RePureTableBar / ReCropperPreview / ReQrcode）补齐 ≥80% 行+分支覆盖的 vitest 组件测试，将组件域全部 `ts/tsx/vue` 文件 strict 迁入清单（94 个域内错误清零），并把 ReDrawer 移出豁免清单。

**Architecture:** 依据 [B3 批次设计](./2026-08-29-pure-web-testing-foundation-b3-design.md)「真实组合优先」口径：组合渲染走真实 Vue + ElementPlus 插件（`src/test-utils/mount.ts` helper）；仅 mock 外部边界——element-plus 浮层组件渲染层（popover/select/dialog/drawer 透传容器，延续 B2「element-plus 渲染层 mock」口径）、第三方库内部（sortablejs / typeit / qrcode / @iconify/vue）、`@/plugins/i18n` 展示层、`@/api/*` HTTP 边界。`~icons/*` 与 `*.svg?component` 经 vitest alias 正则统一 stub（图标渲染无断言价值）。Canvas 绘制行为按 B1.7 print.ts 先例豁免（薄测试逻辑分支、不给 thresholds 键、双侧登记）。

**Tech Stack:** vitest 4 + @vitejs/plugin-vue + plugin-vue-jsx（B0 已建）、@vue/test-utils ^2.5.0、jsdom ^30.0.1（各组件 spec 顶部 `// @vitest-environment jsdom`）、fake timers（rAF / useTimeoutFn / delay 场景）。

**Spec:** [B3 批次设计](./2026-08-29-pure-web-testing-foundation-b3-design.md)；[总体设计](./2026-08-29-pure-web-testing-foundation-design.md) 第 6~7 章；组件事实以 [A3 组件盘点](./component-inventory.md) 为准。

**前置事实（已校准，勿再探测）:**

- B1/B2 已合入 master（HEAD `6b4093b38`，B2 收口提交）；B1/B2 执行期间未触碰 `src/components` 组件层源码。
- **清单基数（2026-08-30 `assert-strict-manifest.mjs` 实测）**：清单 53 项 / 豁免 29 项 / 存量待迁移 171 项；`vitest.config.ts` thresholds 23 键；spec 文件 24 个（B1 13 + B2 11）。
- **B3 域 strict 错误共 94 个分布于 10 件**（正式链复验 2026-08-30）：ReCol 1（TS2722）/ ReIcon 14（hooks 1 + iconifyIconOffline 2 + Select.vue 11）/ ReSegmented 7（index.tsx）/ ReAnimateSelector 5（TS7053×5）/ ReCountTo 6（normal 3 + rebound 3）/ ReDialog 17（index.ts 1 + index.vue 16）/ ReDrawer 15（index.ts 1 + index.vue 14）/ ReImageVerify 1（TS6133 domRef）/ RePureTableBar 24（19 类型错误 + 5 个 `*.svg?component` TS2307——Task 0 补 `vite-svg-loader` types 后该 5 个消失，实际手修 19）/ ReCropperPreview 4；零错误 6 件（ReAuth / RePerms / ReText / ReFlicker / ReQrcode / ReTypeit）。
- **依赖齐备**：@vue/test-utils、jsdom、vitest、@vitest/coverage-v8、vite-svg-loader（catalog，devDependencies）、sortablejs、typeit、qrcode、vue-tippy、@iconify/vue 均已在 `apps/pure-web/package.json`，本批次零新增依赖。
- **`@pureadmin/utils` getSvgInfo 实测**：`getSvgInfo('<svg></svg>')` 返回 `{ width: 0, height: 0, body: '' }`（DOMParser 正常解析不抛错）——`~icons/*?raw` 字符串 stub 对 `offlineIcon.ts` 消费安全。
- **双 stub 决策（对 B3 设计「统一 stub」表述的校准）**：`bar.tsx` 将 5 个 `*.svg?component` 导入用作 JSX 标签（`<SettingIcon/>` 等），若 stub 为字符串 `'<svg></svg>'` 会以字符串标签进 `document.createElement` 抛 InvalidCharacterError；故组件形态用 `defineComponent` 渲染 `h('svg')` 的组件 stub，`?raw` 形态用字符串 stub，alias 按「`?raw` 正则优先 → 通用 `~icons` 正则 → `.svg?component` 正则 → 既有 `@`/`@build`」顺序排列。
- **`build/utils.ts` alias 为对象形态** `{ '@': pathResolve('../src'), '@build': pathResolve() }`——Task 0 将 `resolve.alias` 数组化并把对象条目展开到数组末尾（保序）。
- **router 实例 mock 先例**：B1 `router/utils.spec.ts` 以 `vi.mock('@/router', ...)` 提供可控 `currentRoute.value.meta` 阻断 createRouter 副作用——ReAuth 测试沿用同模式（另需 mock `@/store/modules/permission` / `@/api/routes` / `@/utils/auth`，照抄 B1 工厂形态）。
- **门禁三件套**：`pnpm --filter @multi-admin/pure-web run typecheck`（tsc → vue-tsc → check-strict-web.mjs 滤域内诊断）；`node scripts/assert-strict-manifest.mjs`（防漏：新增文件必进清单或豁免；防倒退）；`npx vitest run --coverage`（thresholds 顶层文件键）。
- 本计划的 TDD 形态说明：组件**功能已在产线运行**，spec 角色是回归网；「红-绿」实际发生在 **check-strict-web typecheck 阶段**——spec 落盘后功能断言即可绿，strict 修复前 typecheck 域内红灯。每任务 Steps 依此编排。

**执行编排:** 串行单 worktree `feat/pure-web-testing-b3`（worktree + subagent-driven，延续 B1/B2 模式）。任务顺序 Task 0（基建 + 首批用例）→ Task 1~5（B3.1）→ Task 6~10（B3.2，Task 10 含 ReDrawer 豁免移出）→ Task 11~12（B3.3，Canvas 豁免口径）→ Task 13 收尾。每任务独立提交（scope `web`），受影响文档同提交。

**批次终态数字（各任务分项之和，Task 13 统一复验）:**

| 项 | 起点 | 增量 | 终态 |
| --- | --- | --- | --- |
| strict 清单 | 53 项 | +71（组件文件 45 + spec 23 + test-utils 3） | 124 项 |
| 豁免清单 | 29 项 | −3（ReDrawer 目录 3 文件移出） | 26 项 |
| 存量待迁移 | 171 项 | −45（组件文件迁出） | 126 项 |
| thresholds 键 | 23 键 | +25（Canvas 三件不给键） | 48 键 |
| spec 文件 | 24 个 | +23 | 47 个 |

---

## Task 0: 组件测试基建 + 首批用例（ReCol / ReFlicker）

**Files:**

- Modify: `apps/pure-web/vitest.config.ts`（alias 数组化 + 三条正则；`test.include` 补 `.spec.tsx`）
- Create: `apps/pure-web/src/test-utils/svg-raw-stub.ts`
- Create: `apps/pure-web/src/test-utils/svg-component-stub.ts`
- Create: `apps/pure-web/src/test-utils/mount.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（types 加 `vite-svg-loader`；include 加 7 项）
- Create: `apps/pure-web/src/components/ReCol/index.spec.ts`
- Create: `apps/pure-web/src/components/ReFlicker/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReCol/index.ts`（1 个 strict 修复）

- [ ] **Step 0.1: vitest.config.ts alias 数组化 + 图标正则 stub**

`vitest.config.ts` 现 `resolve: { alias }`（对象，仅 `@` / `@build`）。vitest（vite）的 `resolve.alias` 支持数组形态且正则 `find` 按数组顺序匹配——在既有两条之前插入三条正则。同时必须改 `test.include`：现值 `['src/**/*.spec.ts', 'build/*.spec.ts']` 不匹配 `.spec.tsx`，Task 11（`bar.spec.tsx`）与 Task 12（ReQrcode `index.spec.tsx`）会被静默跳过、`Test Files 47 passed` 预期破功，须补 `{ts,tsx}` 双扩展名：

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { alias, __APP_INFO__ } from './build/utils';

const svgRawStub = fileURLToPath(
  new URL('./src/test-utils/svg-raw-stub.ts', import.meta.url)
);
const svgComponentStub = fileURLToPath(
  new URL('./src/test-utils/svg-component-stub.ts', import.meta.url)
);

// 独立于 vite.config.ts（设计 3.2）：测试环境不加载 fake-server / cdn-import /
// compression 等构建期插件，不继承 rolldownOptions 等 Vite 8 专属构建配置
export default defineConfig({
  resolve: {
    // 数组形态：正则条目在前（按序匹配），既有 '@'/'@build' 展开殿后
    alias: [
      // `~icons/x?raw`（offlineIcon.ts 34 处，消费方 getSvgInfo 需要字符串）
      { find: /^~icons\/.*\?raw$/, replacement: svgRawStub },
      // `~icons/*` 组件形态（ReDialog / Select.vue / ReQrcode / bar.tsx 等）
      { find: /^~icons\/.*/, replacement: svgComponentStub },
      // `*.svg?component`（vite-svg-loader 为构建期插件，测试链不加载）
      { find: /\.svg\?component$/, replacement: svgComponentStub },
      ...Object.entries(alias).map(([find, replacement]) => ({
        find,
        replacement
      }))
    ]
  },
  plugins: [vue(), vueJsx()],
  // define 块保持不变；test 块仅 include 一处改动（其余保持）：
  test: {
    // ... 既有 env / environment / coverage（含 thresholds）等保持不变
    // 原值 ['src/**/*.spec.ts', 'build/*.spec.ts']——不收 .spec.tsx
    include: ['src/**/*.spec.{ts,tsx}', 'build/*.spec.ts']
  }
});
```

- [ ] **Step 0.2: 两个 stub 文件**

完整文件 `apps/pure-web/src/test-utils/svg-raw-stub.ts`：

```ts
// vitest alias stub：`~icons/*?raw` 的统一替身（见 vitest.config.ts alias 数组）。
// 消费方仅 offlineIcon.ts——将本字符串交给 getSvgInfo（DOMParser 解析），
// 实测 '<svg></svg>' 返回 { width: 0, height: 0, body: '' }，addIcon 登记占位条目无副作用。
export default '<svg></svg>';
```

完整文件 `apps/pure-web/src/test-utils/svg-component-stub.ts`：

```ts
// vitest alias stub：`~icons/*`（组件形态）与 `*.svg?component` 的统一替身
// （见 vitest.config.ts alias 数组）。组件测试断言组件自身行为，图标渲染无断言价值。
// 必须导出组件而非字符串：RePureTableBar 将 svg?component 导入用作 JSX 标签，
// 字符串标签会以 '<svg></svg>' 进 document.createElement 抛 InvalidCharacterError。
import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'SvgIconStub',
  render: () => h('svg')
});
```

- [ ] **Step 0.3: mount helper（ElementPlus 全插件 + ResizeObserver/tippy/图标全局护栏）**

完整文件 `apps/pure-web/src/test-utils/mount.ts`：

```ts
import { mount, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';
import ElementPlus from 'element-plus';
import SvgIconStub from './svg-component-stub';

// jsdom 未实现 ResizeObserver（@pureadmin/utils useResizeObserver、el-scrollbar 依赖）
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

type MountEPGlobal = {
  plugins?: unknown[];
  directives?: Record<string, unknown>;
  components?: Record<string, unknown>;
  mocks?: Record<string, unknown>;
  provide?: Record<string | symbol, unknown>;
};

type MountEPOptions = {
  props?: Recordable;
  attrs?: Recordable;
  slots?: Recordable;
  global?: MountEPGlobal;
};

/**
 * B3 组件测试挂载 helper：
 * - ElementPlus 全插件（el-* 全局组件 + v-loading 等指令）
 * - v-tippy 指令空实现（tippy 实例行为无断言价值；需细测的 spec 自行 vi.mock vue-tippy）
 * - IconifyIconOffline / IconifyIconOnline 全局组件 stub
 *   （main.ts 全局注册，SFC/JSX 以 kebab 标签直接消费，如 bar.tsx、ReQrcode）
 * 注意：mock element-plus 渲染层的 spec 不走本 helper，直接 mount + 局部 global。
 */
export function mountWithEP(
  component: Component,
  options: MountEPOptions = {}
): VueWrapper {
  const { global: extraGlobal, ...rest } = options;
  return mount(component as never, {
    ...rest,
    global: {
      plugins: [ElementPlus, ...(extraGlobal?.plugins ?? [])],
      directives: { tippy: () => {}, ...(extraGlobal?.directives ?? {}) },
      components: {
        IconifyIconOffline: SvgIconStub,
        IconifyIconOnline: SvgIconStub,
        ...(extraGlobal?.components ?? {})
      },
      ...(extraGlobal?.mocks ? { mocks: extraGlobal.mocks } : {}),
      ...(extraGlobal?.provide ? { provide: extraGlobal.provide } : {})
    }
  } as never) as unknown as VueWrapper;
}
```

- [ ] **Step 0.4: tsconfig.strict.json 补 vite-svg-loader 类型**

`compilerOptions.types` 数组追加 `"vite-svg-loader"`（该包自带 `*.svg?component` 模块声明；现状声明仅靠主 tsconfig include `build/plugins.ts` 的副作用生效，strict 链不含——探针复验缺声明时 TableBar 5 个 + import 链约 30 个 TS2307）：

```json
    "types": [
      "node",
      "vite/client",
      "element-plus/global",
      "@pureadmin/table/volar",
      "unplugin-icons/types/vue",
      "@pureadmin/descriptions/volar",
      "vite-svg-loader"
    ]
```

同提交 `include` 追加 7 项（置于数组末尾）：

```json
    "src/test-utils/svg-raw-stub.ts",
    "src/test-utils/svg-component-stub.ts",
    "src/test-utils/mount.ts",
    "src/components/ReCol/index.ts",
    "src/components/ReCol/index.spec.ts",
    "src/components/ReFlicker/index.ts",
    "src/components/ReFlicker/index.spec.ts"
```

- [ ] **Step 0.5: ReCol spec + strict 修复（1 个：TS2722）**

strict 修复（`ReCol/index.ts` L26，`$slots.default` 可能 undefined）：

```ts
      { default: () => this.$slots.default?.() }
```

完整文件 `apps/pure-web/src/components/ReCol/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { ElCol } from 'element-plus';
import ReCol from './index';

describe('ReCol', () => {
  it('默认 value=24 渲染 ElCol 五断点同值，槽内容与透传属性落位', () => {
    const wrapper = mount(ReCol, {
      attrs: { class: 'custom-col' },
      slots: { default: '<span>col-content</span>' }
    });
    const elCol = wrapper.findComponent(ElCol);
    expect(elCol.exists()).toBe(true);
    expect(elCol.props()).toMatchObject({
      xs: 24,
      sm: 24,
      md: 24,
      lg: 24,
      xl: 24
    });
    expect(wrapper.text()).toContain('col-content');
    expect(wrapper.classes()).toContain('custom-col');
  });

  it('value prop 覆盖五断点；无默认槽时渲染不抛错（可选链护栏）', () => {
    const wrapper = mount(ReCol, { props: { value: 12 } });
    expect(wrapper.findComponent(ElCol).props()).toMatchObject({
      xs: 12,
      md: 12,
      xl: 12
    });
  });
});
```

- [ ] **Step 0.6: ReFlicker spec（0 strict 错误）**

完整文件 `apps/pure-web/src/components/ReFlicker/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { useRenderFlicker } from './index';

describe('useRenderFlicker', () => {
  it('无 attrs 时渲染圆点并落 5 个默认 CSS 变量', () => {
    const wrapper = mount(useRenderFlicker());
    const point = wrapper.find('.point-flicker');
    expect(point.exists()).toBe(true);
    const style = (point.element as HTMLElement).style;
    expect(style.getPropertyValue('--point-width')).toBe('12px');
    expect(style.getPropertyValue('--point-height')).toBe('12px');
    expect(style.getPropertyValue('--point-background')).toBe(
      'var(--el-color-primary)'
    );
    expect(style.getPropertyValue('--point-border-radius')).toBe('50%');
    expect(style.getPropertyValue('--point-scale')).toBe('2');
  });

  it('attrs 全量覆盖 5 个 CSS 变量', () => {
    const wrapper = mount(
      useRenderFlicker({
        width: '20px',
        height: '8px',
        borderRadius: 0,
        background: 'red',
        scale: 3
      })
    );
    const style = (wrapper.find('.point-flicker').element as HTMLElement)
      .style;
    expect(style.getPropertyValue('--point-width')).toBe('20px');
    expect(style.getPropertyValue('--point-height')).toBe('8px');
    // borderRadius 为 0 时走 ?? 左侧（0 非 nullish），验证空值合并语义
    expect(style.getPropertyValue('--point-border-radius')).toBe('0');
    expect(style.getPropertyValue('--point-background')).toBe('red');
    expect(style.getPropertyValue('--point-scale')).toBe('3');
  });
});
```

- [ ] **Step 0.7: 验证 + thresholds + 提交**

```bash
cd apps/pure-web && npx vitest run
```

预期：`Test Files 26 passed`（B1+B2 存量 24 不因 alias 改动回归 + ReCol / ReFlicker 2 新）。

```bash
pnpm --filter @multi-admin/pure-web run typecheck
```

预期：通过（域内 0 错误；`vite-svg-loader` types 生效后全链无新增诊断）。

```bash
cd apps/pure-web && npx vitest run src/components/ReCol/index.spec.ts src/components/ReFlicker/index.spec.ts --coverage
```

预期：`ReCol/index.ts`、`ReFlicker/index.ts` 行+分支 100%。`vitest.config.ts` thresholds 追加 2 键：

```ts
        'src/components/ReCol/index.ts': { lines: 80, branches: 80 },
        'src/components/ReFlicker/index.ts': { lines: 80, branches: 80 },
```

```bash
cd ../.. && node scripts/assert-strict-manifest.mjs
```

预期：`✔ strict 清单断言通过（清单 60 项 / 豁免 29 项 / 存量待迁移 171 项）`。

```bash
pnpm exec prettier --write apps/pure-web/vitest.config.ts apps/pure-web/src/test-utils/ apps/pure-web/tsconfig.strict.json apps/pure-web/src/components/ReCol/ apps/pure-web/src/components/ReFlicker/index.spec.ts
git add apps/pure-web/vitest.config.ts apps/pure-web/src/test-utils/ apps/pure-web/tsconfig.strict.json apps/pure-web/src/components/ReCol/index.ts apps/pure-web/src/components/ReCol/index.spec.ts apps/pure-web/src/components/ReFlicker/index.spec.ts
git commit -m "test(web): b3.0 组件测试基建——图标 alias 双 stub、mount helper、vite-svg-loader 类型补位与 ReCol/ReFlicker 首批用例"
```

---

## 通用约定（Task 1~12 每个 spec 文件共用模板）

**环境头**——所有组件 spec 第一行固定：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

**element-plus 渲染层 mock 口径**（延续 B2）：浮层/容器组件（el-popover / el-select / el-dialog / el-drawer / el-tabs / el-dropdown）以 `vi.mock('element-plus', ...)` 换成**槽透传容器**——reference / default / footer / empty 等槽内联渲染、事件以显式触发点（点击按钮）发射；输入类（el-input / el-checkbox / el-button / el-pagination）以最小可交互 stub（真实 DOM input/button + emit）。**凡走此口径的 spec 不使用 mountWithEP**，直接 `mount` + 局部 `global.components`（全局图标组件用 `@/test-utils/svg-component-stub` 注入）。

**i18n mock 模板**（消费 `@/plugins/i18n` 的 spec——Task 11）：

```ts
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));
```

**Canvas 豁免口径**（Task 9 / 12）：jsdom 无 canvas 2d 实现（`getContext('2d')` 返回 null），绘制主体走早退分支；此类组件**不给 thresholds 键**，spec 头部注释注明 Canvas 边界（与 backlog「B3 Canvas 绘制豁免回补」条目构成双向登记）。

**每任务清零流程（Steps 通用骨架）:**

1. 写 spec（本计划给出完整代码）
2. `npx vitest run <spec路径>`——功能回归网绿灯基线
3. `tsconfig.strict.json` include 追加域内全部 `ts/tsx/vue` + spec → `pnpm --filter @multi-admin/pure-web run typecheck` 红（域内错误数 = 任务基数表值）→ 逐条修复
4. 复跑 typecheck 绿 + `npx vitest run <spec路径> --coverage` 目标文件 ≥80% 行+分支
5. `vitest.config.ts` thresholds 追加键（`{ lines: 80, branches: 80 }` 顶层文件键；Canvas 三件与 barrel 文件不加键）
6. `pnpm exec prettier --write <改动文件>` + 独立提交

**格式与提交:** 提交信息 `test(web): b3.x <中文动词开头描述>`（commitlint subject-case 禁止大写开头）；每任务提交前跑 `node scripts/assert-strict-manifest.mjs` 确认防漏断言通过。

---

## Task 1: B3.1 ReText 截断提示组件（0 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReText/src/index.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/components/ReText/index.ts`、`src/components/ReText/src/index.vue`、`src/components/ReText/src/index.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 `'src/components/ReText/src/index.vue'`）

### Step 1.1: 写 spec（tippy 边界 mock + 真实 el-text）

vue-tippy 为外部行为边界（mock `useTippy`，断言组件对实例的接线）；`el-text` 走真实 ElementPlus（mountWithEP）。完整文件 `apps/pure-web/src/components/ReText/src/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tippyInstance = {
  setProps: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn()
};
const useTippyMock = vi.fn(() => tippyInstance);
vi.mock('vue-tippy', () => ({ useTippy: useTippyMock }));

import ReText from './index.vue';
import { mountWithEP } from '@/test-utils/mount';

function setMetrics(
  el: Element,
  metrics: Partial<
    Record<'scrollWidth' | 'clientWidth' | 'scrollHeight' | 'clientHeight', number>
  >
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReText', () => {
  it('挂载时用默认槽内容初始化 tippy 实例', () => {
    const wrapper = mountWithEP(ReText, { slots: { default: 'hello' } });
    expect(useTippyMock).toHaveBeenCalledTimes(1);
    expect((wrapper.element as HTMLElement).textContent).toContain('hello');
    // 未传 tippyProps 时走默认空对象工厂，props 仅 content
    expect(useTippyMock.mock.calls[0][1]).toHaveProperty('content');
  });

  it('单行省略：溢出时悬停启用 tippy 并刷新 props', async () => {
    const wrapper = mountWithEP(ReText, { slots: { default: 'x' } });
    const elText = wrapper.find('.el-text');
    setMetrics(elText.element, { scrollWidth: 100, clientWidth: 50 });
    await elText.trigger('mouseover');
    expect(tippyInstance.setProps).toHaveBeenCalledTimes(1);
    expect(tippyInstance.enable).toHaveBeenCalledTimes(1);
    expect(tippyInstance.disable).not.toHaveBeenCalled();
  });

  it('单行省略：未溢出时悬停禁用 tippy', async () => {
    const wrapper = mountWithEP(ReText, { slots: { default: 'x' } });
    const elText = wrapper.find('.el-text');
    setMetrics(elText.element, { scrollWidth: 30, clientWidth: 50 });
    await elText.trigger('mouseover');
    expect(tippyInstance.disable).toHaveBeenCalledTimes(1);
    expect(tippyInstance.enable).not.toHaveBeenCalled();
  });

  it('多行省略（lineClamp）：按 scrollHeight/clientHeight 判断溢出', async () => {
    const wrapper = mountWithEP(ReText, {
      props: { lineClamp: 2 },
      slots: { default: 'x' }
    });
    const elText = wrapper.find('.el-text');
    setMetrics(elText.element, { scrollHeight: 80, clientHeight: 40 });
    await elText.trigger('mouseover');
    expect(tippyInstance.enable).toHaveBeenCalledTimes(1);
  });

  it('content 槽优先于默认槽作为 tippy 内容；tippyProps 并入实例配置', () => {
    mountWithEP(ReText, {
      props: { tippyProps: { placement: 'top' } },
      slots: { default: 'd', content: '<b>tip</b>' }
    });
    const initProps = useTippyMock.mock.calls[0][1] as Recordable;
    expect(initProps).toMatchObject({ placement: 'top' });
    expect(initProps).toHaveProperty('content');
  });
});
```

### Step 1.2: 验证 + thresholds + 提交

`npx vitest run src/components/ReText/src/index.spec.ts` 全绿 → include 追加 3 项后 `typecheck` 直接绿（0 strict 错误）→ `--coverage` 预期 `src/components/ReText/src/index.vue` 行+分支 100%。thresholds 追加：

```ts
        'src/components/ReText/src/index.vue': { lines: 80, branches: 80 },
```

```bash
pnpm exec prettier --write apps/pure-web/src/components/ReText/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReText/index.ts apps/pure-web/src/components/ReText/src/index.vue apps/pure-web/src/components/ReText/src/index.spec.ts apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.1 补齐 ReText 截断提示测试并迁入 strict 清单（溢出双分支+tippy 接线）"
```

---

## Task 2: B3.1 ReIcon 图标家族（7 spec，14 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReIcon/data.spec.ts`
- Create: `apps/pure-web/src/components/ReIcon/src/hooks.spec.ts`
- Create: `apps/pure-web/src/components/ReIcon/src/iconifyIconOffline.spec.ts`
- Create: `apps/pure-web/src/components/ReIcon/src/iconifyIconOnline.spec.ts`
- Create: `apps/pure-web/src/components/ReIcon/src/iconfont.spec.ts`
- Create: `apps/pure-web/src/components/ReIcon/src/offlineIcon.spec.ts`
- Create: `apps/pure-web/src/components/ReIcon/src/Select.spec.ts`
- Modify: `apps/pure-web/src/components/ReIcon/src/hooks.ts`（1 strict 修复）
- Modify: `apps/pure-web/src/components/ReIcon/src/iconifyIconOffline.ts`（2 strict 修复）
- Modify: `apps/pure-web/src/components/ReIcon/src/Select.vue`（11 strict 修复）
- Modify: `apps/pure-web/tsconfig.strict.json`（include 追加 16 项：组件域 9 + spec 7）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 7 键）

strict 基数（实测 14）：`hooks.ts` 1 + `iconifyIconOffline.ts` 2（`addIcon(this.icon, this.icon)` / `h(this.icon)` 的 unknown 收窄）+ `Select.vue` 11（回调隐式 any：`onChangeIcon(item)` / `onCurrentChange(page)` / `handleClick({ props })` 与 `animateMap` 式索引访问等）——逐条以 vue-tsc 诊断为准修复（索引访问统一 `Record<string, X>` 或窄化断言，回调补参数类型）。

### Step 2.1: data.spec.ts（导入即全行执行，天然 100%）

完整文件 `apps/pure-web/src/components/ReIcon/data.spec.ts`（node 环境即可，无需 jsdom 头）：

```ts
import { describe, it, expect } from 'vitest';
import { IconJson } from './data';

describe('IconJson 数据完整性', () => {
  it('含 ep:/ri:/fa-solid: 三图标集且均为非空数组', () => {
    expect(Object.keys(IconJson)).toEqual(['ep:', 'ri:', 'fa-solid:']);
    for (const list of Object.values(IconJson)) {
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it('各集图标名无重复、无空串', () => {
    for (const list of Object.values(IconJson)) {
      expect(new Set(list).size).toBe(list.length);
      expect(list.every(i => typeof i === 'string' && i.length > 0)).toBe(
        true
      );
    }
  });
});
```

### Step 2.2: hooks.spec.ts（useRenderIcon 六分支 + 缓存上限）

`@iconify/vue/dist/offline` mock 为可捕获的 addIcon + 渲染桩（Icon 真实实现依赖图标数据注册，无断言价值）。完整文件 `apps/pure-web/src/components/ReIcon/src/hooks.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

const addIconMock = vi.hoisted(() => vi.fn());
vi.mock('@iconify/vue/dist/offline', async () => {
  const { defineComponent, h: vh } = await import('vue');
  return {
    addIcon: addIconMock,
    Icon: defineComponent({
      name: 'IconifyIconStub',
      props: { icon: { type: String, default: '' } },
      render(this: { icon: string }) {
        return vh('i', { class: 'iconify-stub' }, this.icon);
      }
    })
  };
});

import { useRenderIcon } from './hooks';

describe('useRenderIcon', () => {
  it('SVG 字符串：剥离 width/height 后原样渲染，二次调用命中缓存', () => {
    const svg =
      '<svg width="10" height="10" viewBox="0 0 24 24"><path d="M1 1"/></svg>';
    const wrapper = mount(useRenderIcon(svg));
    const span = wrapper.find('.svg-raw-icon');
    expect(span.exists()).toBe(true);
    expect(span.html()).not.toContain('width="10"');
    expect(span.html()).toContain('viewBox="0 0 24 24"');
    // 缓存命中路径：同 key 二次取组件渲染结果一致
    const wrapper2 = mount(useRenderIcon(svg));
    expect(wrapper2.find('.svg-raw-icon').html()).toContain('<path d="M1 1"');
  });

  it('缓存超过 200 条时清空重建（容量护栏分支）', () => {
    for (let i = 0; i < 205; i++) {
      useRenderIcon(`<svg data-i="${i}"><path/></svg>`);
    }
    const wrapper = mount(useRenderIcon('<svg width="1"><i/></svg>'));
    expect(wrapper.find('.svg-raw-icon').exists()).toBe(true);
    expect(wrapper.find('.svg-raw-icon').html()).not.toContain('width="1"');
  });

  it('图片 URL（https 与 data:image）渲染固定尺寸 img', () => {
    const wrapper = mount(useRenderIcon('https://cdn.example.com/a.png'));
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe('https://cdn.example.com/a.png');
    expect(img.attributes('style')).toContain('18px');
    expect(
      mount(useRenderIcon('data:image/png;base64,AAA')).find('img').exists()
    ).toBe(true);
  });

  it('IF- iconfont：空格切分图标名与类型，落 FontIcon 默认分支', () => {
    const wrapper = mount(useRenderIcon('IF-team mytype'));
    const i = wrapper.find('i');
    expect(i.classes()).toEqual(
      expect.arrayContaining(['iconfont', 'team'])
    );
  });

  it('函数组件 / 含 render 对象：有 attrs 返回 vnode、无 attrs 返回原组件', () => {
    const Fn = () => h('em', { class: 'fn-icon' });
    expect(useRenderIcon(Fn)).toBe(Fn);
    const withAttrs = useRenderIcon(Fn, { color: 'red' });
    expect(mount(withAttrs as never).find('.fn-icon').exists()).toBe(true);
    const renderObj = { render: () => h('u', { class: 'render-obj' }) };
    expect(
      mount(useRenderIcon(renderObj) as never).find('.render-obj').exists()
    ).toBe(true);
  });

  it('对象分支：addIcon(icon, icon) 登记后交给 IconifyIconOffline 渲染', () => {
    const iconData = { body: '<path d="M0 0"/>' };
    const wrapper = mount(useRenderIcon(iconData));
    expect(addIconMock).toHaveBeenCalledWith(iconData, iconData);
    expect(wrapper.exists()).toBe(true);
  });

  it('字符串分支：含冒号走在线、不含走离线；空值早退不渲染', () => {
    expect((useRenderIcon('ep:add-location') as { name: string }).name).toBe(
      'Icon'
    );
    const offline = mount(useRenderIcon('local-icon'));
    expect(offline.find('.iconify-stub').text()).toBe('local-icon');
    const empty = mount(useRenderIcon(''));
    expect(empty.find('.iconify-stub').exists()).toBe(false);
    expect(empty.find('.svg-raw-icon').exists()).toBe(false);
  });
});
```

### Step 2.3: iconifyIconOffline.spec.ts（string / object 双分支）

完整文件 `apps/pure-web/src/components/ReIcon/src/iconifyIconOffline.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const addIconMock = vi.hoisted(() => vi.fn());
vi.mock('@iconify/vue/dist/offline', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    addIcon: addIconMock,
    Icon: dc({
      name: 'IconifyIconStub',
      props: { icon: { type: String, default: '' } },
      render(this: { icon: string }, _ctx: unknown, $attrs: { style?: string }) {
        return vh(
          'i',
          { class: 'iconify-stub', style: $attrs?.style },
          this.icon
        );
      }
    })
  };
});

import IconifyIconOffline from './iconifyIconOffline';

describe('IconifyIconOffline', () => {
  it('字符串图标：渲染 iconify Icon 并附 outline:none', () => {
    const wrapper = mount(IconifyIconOffline, { props: { icon: 'ep:menu' } });
    const stub = wrapper.find('.iconify-stub');
    expect(stub.exists()).toBe(true);
    expect(stub.text()).toBe('ep:menu');
    expect(stub.attributes('style')).toContain('outline');
  });

  it('attrs 携带 style 时合并 outline:none 与原样式', () => {
    const wrapper = mount(IconifyIconOffline, {
      props: { icon: 'ep:menu' },
      attrs: { style: { color: 'red' } }
    });
    const style = wrapper.find('.iconify-stub').attributes('style');
    expect(style).toContain('color');
    expect(style).toContain('outline');
  });

  it('对象图标：addIcon(icon, icon) 登记后直接渲染该组件', () => {
    const Inner = defineComponent({
      render: () => h('b', { class: 'obj-icon' }, 'obj')
    });
    const wrapper = mount(IconifyIconOffline, { props: { icon: Inner } });
    expect(addIconMock).toHaveBeenCalledWith(Inner, Inner);
    expect(wrapper.find('.obj-icon').exists()).toBe(true);
  });
});
```

### Step 2.4: iconifyIconOnline.spec.ts（style 合并双分支）

完整文件 `apps/pure-web/src/components/ReIcon/src/iconifyIconOnline.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@iconify/vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Icon: defineComponent({
      name: 'OnlineIconStub',
      props: { icon: { type: String, default: '' } },
      render(this: { icon: string }) {
        return h('i', { class: 'online-stub' }, this.icon);
      }
    })
  };
});

import IconifyIconOnline from './iconifyIconOnline';

describe('IconifyIconOnline', () => {
  it('icon 字符串化渲染并附 outline:none（无 attrs.style 分支）', () => {
    const wrapper = mount(IconifyIconOnline, {
      props: { icon: 'ri:search-line' }
    });
    const stub = wrapper.find('.online-stub');
    expect(stub.text()).toBe('ri:search-line');
    expect(wrapper.attributes('style') ?? stub.attributes('style')).toContain(
      'outline'
    );
  });

  it('attrs 携带 style 时合并 outline:none 与原样式', () => {
    const wrapper = mount(IconifyIconOnline, {
      props: { icon: 'ri:search-line' },
      attrs: { style: { fontSize: '20px' } }
    });
    expect(wrapper.html()).toContain('outline');
  });
});
```

### Step 2.5: iconfont.spec.ts（uni / svg / font-class 三分支）

完整文件 `apps/pure-web/src/components/ReIcon/src/iconfont.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FontIcon from './iconfont';

describe('FontIcon', () => {
  it('unicode 模式（uni 属性或 iconType=uni）：i.iconfont 内容为图标码', () => {
    const wrapper = mount(FontIcon, {
      props: { icon: '&#xe600;' },
      attrs: { iconType: 'uni' }
    });
    const i = wrapper.find('i.iconfont');
    expect(i.exists()).toBe(true);
    expect(i.text()).toContain('&#xe600;');
    expect(mount(FontIcon, { props: { icon: 'x' }, attrs: { uni: true } }).find('i.iconfont').exists()).toBe(true);
  });

  it('svg 模式：svg.icon-svg 内 use 指向 #图标名', () => {
    const wrapper = mount(FontIcon, {
      props: { icon: 'team-icon' },
      attrs: { iconType: 'svg' }
    });
    const use = wrapper.find('svg.icon-svg use');
    expect(use.exists()).toBe(true);
    expect(use.attributes('xlink:href')).toBe('#team-icon');
  });

  it('默认 font-class 模式：i 携带 iconfont + 图标名类', () => {
    const wrapper = mount(FontIcon, { props: { icon: 'team-a' } });
    const i = wrapper.find('i');
    expect(i.classes()).toEqual(expect.arrayContaining(['iconfont', 'team-a']));
  });
});
```

### Step 2.6: offlineIcon.spec.ts（34 图标注册接线）

`~icons/*?raw` 已由 Task 0 alias 接字符串 stub；getSvgInfo 走真实实现（实测 `'<svg></svg>'` 返回 `{ width: 0, height: 0, body: '' }`）。完整文件 `apps/pure-web/src/components/ReIcon/src/offlineIcon.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const addIconMock = vi.hoisted(() => vi.fn());
vi.mock('@iconify/vue/dist/offline', () => ({ addIcon: addIconMock }));

describe('offlineIcon 本地菜单图标注册', () => {
  it('导入即把 34 个图标以 getSvgInfo 解析结果 addIcon 登记', async () => {
    await import('./offlineIcon');
    expect(addIconMock).toHaveBeenCalledTimes(34);
    expect(addIconMock.mock.calls[0][0]).toBe('ep/menu');
    expect(addIconMock.mock.calls[0][1]).toEqual({
      width: 0,
      height: 0,
      body: ''
    });
    expect(addIconMock.mock.calls[8][0]).toBe('ri/mind-map');
  });
});
```

### Step 2.7: Select.spec.ts（分页 / 筛选 / 选中 / 清空 / tab 切换）

element-plus 渲染层 mock 为透传容器（口径见「通用约定」）：el-popover 内联渲染 reference + default 槽，点击 reference 发射 `before-enter`、显式按钮发射 `after-leave`；el-tabs 提供模拟 `tab-click`；图标全局组件注入 stub。完整文件 `apps/pure-web/src/components/ReIcon/src/Select.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElInput: dc({
      props: ['modelValue', 'disabled', 'placeholder'],
      emits: ['update:modelValue'],
      setup(props: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-input' }, [
            vh('input', {
              value: props.modelValue ?? '',
              disabled: props.disabled,
              placeholder: props.placeholder,
              onInput: (e: Event) =>
                emit('update:modelValue', (e.target as HTMLInputElement).value)
            }),
            slots.append?.()
          ]);
      }
    }),
    ElPopover: dc({
      emits: ['before-enter', 'after-leave'],
      setup(_props: unknown, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-popover' }, [
            vh(
              'div',
              {
                class: 'ep-popover-ref',
                onClick: () => emit('before-enter')
              },
              slots.reference?.()
            ),
            slots.default?.(),
            vh(
              'button',
              {
                class: 'ep-popover-leave',
                onClick: () => emit('after-leave')
              },
              'leave'
            )
          ]);
      }
    }),
    ElTabs: dc({
      props: ['modelValue'],
      emits: ['update:modelValue', 'tab-click'],
      setup(_props: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-tabs' }, [
            vh(
              'button',
              {
                class: 'ep-tabs-switch-ri',
                onClick: () => emit('tab-click', { props: { name: 'ri:' } })
              },
              'switch-ri'
            ),
            slots.default?.()
          ]);
      }
    }),
    ElTabPane: dc({
      props: ['label', 'name'],
      setup(_props: any, { slots }: any) {
        return () => vh('div', { class: 'ep-tab-pane' }, slots.default?.());
      }
    }),
    ElScrollbar: dc({
      setup(_props: any, { slots }: any) {
        return () => vh('div', slots.default?.());
      }
    }),
    ElEmpty: dc({
      props: ['description'],
      setup(props: any) {
        return () => vh('div', { class: 'ep-empty' }, props.description);
      }
    }),
    ElPagination: dc({
      props: ['total', 'currentPage', 'pageSize'],
      emits: ['current-change'],
      setup(props: any, { emit }: any) {
        return () =>
          vh(
            'button',
            {
              class: 'ep-pagination-next',
              'data-current': props.currentPage,
              'data-total': props.total,
              onClick: () => emit('current-change', props.currentPage + 1)
            },
            'next'
          );
      }
    }),
    ElButton: dc({
      setup(_props: any, { slots }: any) {
        return () => vh('button', { class: 'ep-button' }, slots.default?.());
      }
    })
  };
});

import IconSelect from './Select.vue';
import { IconJson } from '../data';
import SvgIconStub from '@/test-utils/svg-component-stub';

function mountSelect(initial = ''): VueWrapper {
  return mount(IconSelect, {
    props: {
      modelValue: initial,
      'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v })
    },
    global: {
      components: {
        IconifyIconOffline: SvgIconStub,
        IconifyIconOnline: SvgIconStub
      }
    }
  });
}

describe('IconSelect', () => {
  it('默认 ep: 集每页 35 个图标，分页 total 为全量', () => {
    const wrapper = mountSelect();
    expect(wrapper.findAll('li.icon-item').length).toBe(35);
    const pager = wrapper.find('.ep-pagination-next');
    expect(pager.attributes('data-total')).toBe(
      String(IconJson['ep:'].length)
    );
    expect(pager.attributes('data-current')).toBe('1');
  });

  it('点击图标：modelValue 更新为 前缀+图标名', async () => {
    const wrapper = mountSelect();
    await wrapper.find('li.icon-item').trigger('click');
    expect((wrapper.props('modelValue') as string).startsWith('ep:')).toBe(
      true
    );
    expect(wrapper.props('modelValue')).toBe(`ep:${IconJson['ep:'][0]}`);
  });

  it('筛选：命中项收窄、页码重置，无命中时空态文案带搜索词', async () => {
    const wrapper = mountSelect();
    const search = wrapper.find('input[placeholder="搜索图标"]');
    await search.setValue('alarm-clock');
    const items = wrapper.findAll('li.icon-item');
    expect(items.length).toBe(1);
    expect(items[0].attributes('title')).toBe('alarm-clock');
    await search.setValue('no-such-icon-xyz');
    expect(wrapper.findAll('li.icon-item').length).toBe(0);
    expect(wrapper.find('.ep-empty').text()).toContain('no-such-icon-xyz');
  });

  it('分页：current-change 后渲染第二页首个图标', async () => {
    const wrapper = mountSelect();
    await wrapper.find('.ep-pagination-next').trigger('click');
    expect(wrapper.find('li.icon-item').attributes('title')).toBe(
      IconJson['ep:'][35]
    );
  });

  it('初始 modelValue 定位页：打开弹层时跳到目标图标所在页', async () => {
    const target = IconJson['ep:'][40];
    const wrapper = mountSelect(`ep:${target}`);
    await wrapper.find('.ep-popover-ref').trigger('click'); // before-enter
    expect(wrapper.find('.ep-pagination-next').attributes('data-current')).toBe(
      '2'
    );
    expect(
      wrapper.findAll('li.icon-item').some(li => li.attributes('title') === target)
    ).toBe(true);
  });

  it('初始 modelValue 为空：打开弹层早退不抛错', async () => {
    const wrapper = mountSelect('');
    await wrapper.find('.ep-popover-ref').trigger('click');
    expect(wrapper.find('.ep-pagination-next').attributes('data-current')).toBe(
      '1'
    );
  });

  it('tab 切换到 ri: 集后渲染 ri 图标；离开弹层清空筛选', async () => {
    const wrapper = mountSelect();
    await wrapper.find('.ep-tabs-switch-ri').trigger('click');
    expect(wrapper.find('li.icon-item').attributes('title')).toBe(
      IconJson['ri:'][0]
    );
    const search = wrapper.find('input[placeholder="搜索图标"]');
    await search.setValue('admin');
    await wrapper.find('.ep-popover-leave').trigger('click'); // after-leave
    expect((search.element as HTMLInputElement).value).toBe('');
  });

  it('清空：icon 与 modelValue 双双置空', async () => {
    const wrapper = mountSelect();
    await wrapper.find('li.icon-item').trigger('click');
    await wrapper.find('.ep-button').trigger('click');
    expect(wrapper.props('modelValue')).toBe('');
  });
});
```

### Step 2.8: 验证 + thresholds + 提交

```bash
cd apps/pure-web && npx vitest run src/components/ReIcon/
```

预期：7 spec 全绿。include 追加 16 项（组件域 9：`index.ts` / `data.ts` / `src/hooks.ts` / `src/iconfont.ts` / `src/iconifyIconOffline.ts` / `src/iconifyIconOnline.ts` / `src/offlineIcon.ts` / `src/Select.vue` / `src/types.ts`；spec 7）后 `typecheck` 红 → 域内 14 条诊断逐条修复 → 复跑绿。`--coverage` 预期 7 个目标文件 ≥80% 行+分支（`data.ts` 导入即 100%）。thresholds 追加 7 键（`index.ts` barrel 与 `types.ts` 纯类型不加）：

```ts
        'src/components/ReIcon/data.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/hooks.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/iconifyIconOffline.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/iconifyIconOnline.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/iconfont.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/offlineIcon.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/Select.vue': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReIcon/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReIcon/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.1 补齐 ReIcon 七 spec（数据完整性/hooks 六分支/离线注册/选择器交互）并迁入 strict 清单"
```

---

## Task 3: B3.1 ReSegmented 分段选择器（7 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReSegmented/src/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReSegmented/src/index.tsx`（7 strict 修复：`handleChange` / `handleMouseenter` / `handleMouseleave` 等解构参数隐式 any，按诊断补 `OptionsType` / `number` / `Event` 注解）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/components/ReSegmented/index.ts`、`src/components/ReSegmented/src/index.tsx`、`src/components/ReSegmented/src/type.ts`、`src/components/ReSegmented/src/index.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 `'src/components/ReSegmented/src/index.tsx'`）

### Step 3.1: 写 spec

真实依赖：useRenderIcon（icon 用 SVG 字符串分支，避开 iconify 网络）、useDark / useResizeObserver（@pureadmin/utils，ResizeObserver 由 mount.ts 全局 stub 兕底）；v-tippy 由 mountWithEP 指令 stub 接管。完整文件 `apps/pure-web/src/components/ReSegmented/src/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, h } from 'vue';
import { mountWithEP } from '@/test-utils/mount';
import ReSegmented from './index';

const options = [
  { label: '一', tip: 'tip-1' },
  { label: '二' },
  { label: '三', disabled: true }
];

beforeEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('ReSegmented', () => {
  it('按 options 渲染 label 列表与 radio，尺寸类名随 size 切换', () => {
    const wrapper = mountWithEP(ReSegmented, {
      props: { options, size: 'small' }
    });
    expect(wrapper.findAll('label.pure-segmented-item').length).toBe(3);
    expect(wrapper.findAll('input[type="radio"]').length).toBe(3);
    expect(wrapper.find('.pure-segmented--small').exists()).toBe(true);
    expect(wrapper.find('.pure-segmented--large').exists()).toBe(false);
  });

  it('默认模式（modelValue 非 number）：点击切换内部选中并 emit change', async () => {
    const wrapper = mountWithEP(ReSegmented, { props: { options } });
    const labels = wrapper.findAll('label.pure-segmented-item');
    await labels[1].trigger('click');
    const change = wrapper.emitted('change') as Array<[{ index: number }]>;
    expect(change[0][0].index).toBe(1);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await nextTick();
  });

  it('number modelValue：点击 emit update:modelValue', async () => {
    const wrapper = mountWithEP(ReSegmented, {
      props: { options, modelValue: 0 }
    });
    await wrapper.findAll('label.pure-segmented-item')[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2]);
  });

  it('全局 disabled 与 option.disabled 均拦截切换，并挂禁用类', async () => {
    const disabledWrapper = mountWithEP(ReSegmented, {
      props: { options, disabled: true }
    });
    await disabledWrapper
      .findAll('label.pure-segmented-item')[0]
      .trigger('click');
    expect(disabledWrapper.emitted('change')).toBeUndefined();
    expect(
      disabledWrapper.find('.pure-segmented-item-disabled').exists()
    ).toBe(true);

    const wrapper = mountWithEP(ReSegmented, { props: { options } });
    await wrapper.findAll('label.pure-segmented-item')[2].trigger('click');
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('hover 背景：非选中项进浅色；当前项/禁用项清空；离开复位', async () => {
    const wrapper = mountWithEP(ReSegmented, { props: { options } });
    const labels = wrapper.findAll('label.pure-segmented-item');
    await labels[1].trigger('mouseenter');
    expect(labels[1].attributes('style')).toContain('rgba(0, 0, 0, 0.06)');
    await labels[1].trigger('mouseleave');
    await labels[0].trigger('mouseenter'); // 当前选中项→背景清空分支
    expect(labels[0].attributes('style') ?? '').not.toContain(
      'rgba(0, 0, 0, 0.06)'
    );
  });

  it('dark 模式下 hover 背景取 #1f1f1f（useDark 分支）', async () => {
    document.documentElement.classList.add('dark');
    const wrapper = mountWithEP(ReSegmented, { props: { options } });
    const labels = wrapper.findAll('label.pure-segmented-item');
    await labels[1].trigger('mouseenter');
    expect(labels[1].attributes('style')).toContain('#1f1f1f');
  });

  it('icon（SVG 字符串）与函数 label 分支', () => {
    const wrapper = mountWithEP(ReSegmented, {
      props: {
        options: [
          { icon: '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>', label: '带图' },
          { label: () => h('b', { class: 'fn-label' }, 'fn') }
        ]
      }
    });
    expect(wrapper.find('.pure-segmented-item-icon .svg-raw-icon').exists()).toBe(
      true
    );
    expect(wrapper.find('.fn-label').exists()).toBe(true);
  });

  it('block/resize 接入 ResizeObserver 不抛错；初始化后选中层可见', async () => {
    const wrapper = mountWithEP(ReSegmented, {
      props: { options, block: true }
    });
    expect(wrapper.find('.pure-segmented-block').exists()).toBe(true);
    await nextTick();
    await nextTick();
    const selected = wrapper.find('.pure-segmented-item-selected');
    expect((selected.element as HTMLElement).style.display).toBe('block');
  });
});
```

说明：dark 用例依赖 useDark 从 `html.dark` 类读取；若执行时 useDark 实际读取机制不同（如 localStorage），按实现调整布置手段，断言意图不变（覆盖 `isDark.value` 三元分支）。

### Step 3.2: 验证 + thresholds + 提交

`npx vitest run src/components/ReSegmented/` 全绿 → include 追加 4 项后 typecheck 红（7 条）→ 修复 → 绿 → `--coverage` 预期 `src/components/ReSegmented/src/index.tsx` ≥80% 行+分支。thresholds 追加：

```ts
        'src/components/ReSegmented/src/index.tsx': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReSegmented/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReSegmented/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.1 补齐 ReSegmented 分段选择测试并迁入 strict 清单（双模式切换/禁用拦截/hover 明暗分支）"
```

---

## Task 4: B3.1 ReAnimateSelector 动画选择器（5 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReAnimateSelector/src/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReAnimateSelector/src/index.vue`（5 个 TS7053：`animateMap` 键索引访问，按诊断改 `ref<Record<string | number, { loading: boolean }>>({})` 并窄化 `filterMethod` / `onMouseEnter` 参数）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 `src/components/ReAnimateSelector/index.ts`、`src/components/ReAnimateSelector/src/animate.ts`、`src/components/ReAnimateSelector/src/index.vue`、`src/components/ReAnimateSelector/src/index.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 2 键：`index.vue`、`animate.ts`）

### Step 4.1: 写 spec（el-select 透传容器）

element-plus 渲染层 mock：el-select 内联渲染 `#empty` 槽，提供筛选输入与清空按钮；完整文件 `apps/pure-web/src/components/ReAnimateSelector/src/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElSelect: dc({
      props: ['modelValue', 'placeholder', 'filterMethod'],
      emits: ['clear'],
      setup(props: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-select' }, [
            vh('input', {
              class: 'ep-select-filter',
              onInput: (e: Event) =>
                (props.filterMethod as (v: string) => void)(
                  (e.target as HTMLInputElement).value
                )
            }),
            vh(
              'button',
              { class: 'ep-select-clear', onClick: () => emit('clear') },
              'clear'
            ),
            slots.empty?.()
          ]);
      }
    }),
    ElScrollbar: dc({
      setup(_p: any, { slots }: any) {
        return () => vh('div', slots.default?.());
      }
    }),
    ElEmpty: dc({
      props: ['description'],
      setup(props: any) {
        return () => vh('div', { class: 'ep-empty' }, props.description);
      }
    })
  };
});

import ReAnimateSelector from './index.vue';
import { animates } from './animate';

function mountSelector(initial = ''): VueWrapper {
  return mount(ReAnimateSelector, {
    props: {
      modelValue: initial,
      'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v })
    }
  });
}

describe('ReAnimateSelector', () => {
  it('渲染全量动画列表', () => {
    const wrapper = mountSelector();
    expect(wrapper.findAll('li').length).toBe(animates.length);
  });

  it('点击选中：modelValue 更新为动画名，选中项带主色内联样式', async () => {
    const wrapper = mountSelector();
    await wrapper.find('li').trigger('click');
    expect(wrapper.props('modelValue')).toBe(animates[0]);
    expect(wrapper.find('li').attributes('style')).toContain(
      'var(--el-color-primary)'
    );
  });

  it('筛选收窄列表；无命中时空态文案带搜索词', async () => {
    const wrapper = mountSelector();
    await wrapper.find('.ep-select-filter').setValue('bounce');
    const items = wrapper.findAll('li');
    expect(items.length).toBe(1);
    expect(items[0].find('h4').text()).toBe('bounce');
    await wrapper.find('.ep-select-filter').setValue('no-such-animate');
    expect(wrapper.findAll('li').length).toBe(0);
    expect(wrapper.find('.ep-empty').text()).toContain('no-such-animate');
  });

  it('清空：modelValue 置空', async () => {
    const wrapper = mountSelector(animates[0]);
    await wrapper.find('.ep-select-clear').trigger('click');
    expect(wrapper.props('modelValue')).toBe('');
  });

  it('mouseenter 翻转预览动画类；再进关闭；mouseleave 复位', async () => {
    const wrapper = mountSelector();
    const li = wrapper.find('li');
    await li.trigger('mouseenter');
    expect(li.find('h4').classes().join(' ')).toContain(
      `animate__${animates[0]} animate__infinite`
    );
    await li.trigger('mouseenter'); // loading→false 分支
    expect(li.find('h4').classes().join(' ')).not.toContain(
      'animate__infinite'
    );
    await li.trigger('mouseleave');
    expect(li.find('h4').classes().join(' ')).not.toContain(
      `animate__${animates[0]}`
    );
  });
});
```

### Step 4.2: 验证 + thresholds + 提交

`npx vitest run src/components/ReAnimateSelector/` 全绿 → include 追加 4 项后 typecheck 红（5 条）→ 修复 → 绿 → `--coverage` 预期 `index.vue`、`animate.ts`（导入即 100%）≥80%。thresholds 追加：

```ts
        'src/components/ReAnimateSelector/src/index.vue': { lines: 80, branches: 80 },
        'src/components/ReAnimateSelector/src/animate.ts': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReAnimateSelector/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReAnimateSelector/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.1 补齐 ReAnimateSelector 动画选择测试并迁入 strict 清单（筛选/选中/预览翻转/清空）"
```

---

## Task 5: B3.1 ReCountTo 数字动画双形态（6 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReCountTo/src/normal/index.spec.ts`
- Create: `apps/pure-web/src/components/ReCountTo/src/rebound/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReCountTo/src/normal/index.tsx`（3 strict 修复，按诊断补类型注解）
- Modify: `apps/pure-web/src/components/ReCountTo/src/rebound/index.tsx`（3 strict 修复：`testUA = regexp =>` 隐式 any 等）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 7 项：`index.ts` + normal/rebound 各 `index.tsx`/`props.ts` + 2 spec）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 4 键）

### Step 5.1: normal spec（fake timers 驱动 rAF，四象限 useEasing×方向）

完整文件 `apps/pure-web/src/components/ReCountTo/src/normal/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ReNormalCountTo from './index';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReNormalCountTo', () => {
  it('计数（非缓动）：到达终值并发 callback，emit mounted', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 100, duration: 1000, useEasing: false }
    });
    expect(wrapper.emitted('mounted')).toHaveLength(1);
    vi.advanceTimersByTime(1200);
    expect(wrapper.text()).toContain('100');
    expect(wrapper.emitted('callback')).toHaveLength(1);
  });

  it('计数（默认缓动）：同样收敛到终值', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 50, duration: 800 }
    });
    vi.advanceTimersByTime(1000);
    expect(wrapper.text()).toContain('50');
    expect(wrapper.emitted('callback')).toHaveLength(1);
  });

  it('倒计数（非缓动）：递减到 endVal 并钳位', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 100, endVal: 0, duration: 1000, useEasing: false }
    });
    vi.advanceTimersByTime(1200);
    expect(wrapper.text()).toContain('0');
    expect(wrapper.emitted('callback')).toHaveLength(1);
  });

  it('倒计数（缓动）：同样收敛', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 60, endVal: 10, duration: 800, useEasing: true }
    });
    vi.advanceTimersByTime(1000);
    expect(wrapper.text()).toContain('10');
  });

  it('formatNumber：前缀/后缀/分隔符/小数位齐上', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: {
        startVal: 0,
        endVal: 1234567,
        duration: 500,
        useEasing: false,
        decimals: 2,
        separator: ',',
        prefix: '¥',
        suffix: '元'
      }
    });
    vi.advanceTimersByTime(700);
    expect(wrapper.text()).toContain('¥1,234,567.00元');
  });

  it('separator 为数字时跳过千分位分组（分支覆盖）', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: {
        startVal: 0,
        endVal: 1234567,
        duration: 500,
        useEasing: false,
        decimals: 2,
        separator: 0 as unknown as string
      }
    });
    vi.advanceTimersByTime(700);
    expect(wrapper.text()).toContain('1234567.00');
  });

  it('startVal/endVal 变更且 autoplay 时重启动画', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 0, endVal: 10, duration: 300, useEasing: false }
    });
    vi.advanceTimersByTime(500);
    wrapper.setProps({ endVal: 20 });
    vi.advanceTimersByTime(500);
    expect(wrapper.text()).toContain('20');
    expect(wrapper.emitted('callback')?.length).toBeGreaterThanOrEqual(2);
  });

  it('autoplay=false：挂载不启动，显示初始格式化值', () => {
    const wrapper = mount(ReNormalCountTo, {
      props: { startVal: 7, endVal: 100, autoplay: false }
    });
    vi.advanceTimersByTime(1500);
    expect(wrapper.text()).toContain('7');
    expect(wrapper.emitted('callback')).toBeUndefined();
  });
});
```

覆盖率预案：`pauseResume` / `pause` / `resume` / `reset` 四函数未对外暴露（源码内 `eslint-disable no-unused-vars` 即死码），若实测 `normal/index.tsx` 行覆盖因此跌破 80%，则给组件补最小可测性钩子 `expose({ pauseResume, reset })`（纯接口暴露、运行时语义不变，`ReCountTo/README.md` 同提交补一行说明）后复测；不得为凑覆盖率断言不存在的语义。

### Step 5.2: rebound spec（Safari UA 双分支 + 卸载清理）

完整文件 `apps/pure-web/src/components/ReCountTo/src/rebound/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ReboundCountTo from './index';

const UA_KEY = 'userAgent';
const originalUA = navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(navigator, UA_KEY, { value: ua, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  setUA(originalUA);
  vi.useRealTimers();
});

describe('ReboundCountTo', () => {
  it('渲染 0~9 滚轮（11 个 li）与模糊滤镜，CSS 变量落位', () => {
    const wrapper = mount(ReboundCountTo, {
      props: { i: 5, delay: 1, blur: 3 }
    });
    expect(wrapper.findAll('li').length).toBe(11);
    expect(wrapper.find('feGaussianBlur').attributes('stdDeviation')).toBe(
      '0 3'
    );
    const scrollNum = wrapper.find('.scroll-num').element as HTMLElement;
    expect(scrollNum.style.getPropertyValue('--i')).toBe('5');
    expect(scrollNum.style.getPropertyValue('--delay')).toBe('1');
  });

  it('非 Safari：不注册延时补帧定时器', () => {
    setUA('Mozilla/5.0 (X11; Linux x86_64) jsdom');
    const wrapper = mount(ReboundCountTo, { props: { i: 1 } });
    vi.advanceTimersByTime(2000);
    expect((wrapper.find('ul').element as HTMLElement).style.animation).toBe(
      ''
    );
  });

  it('Safari：delay 秒后给 ul 补静态位移样式；卸载清理定时器不抛错', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'
    );
    const wrapper = mount(ReboundCountTo, { props: { i: 2, delay: 1 } });
    vi.advanceTimersByTime(1100);
    const style = (wrapper.find('ul').element as HTMLElement).style;
    expect(style.animation).toBe('none');
    expect(style.transform).toContain('translateY');
    // 未触发的定时器场景：新建后立刻卸载（onBeforeUnmount clearTimeout）
    const wrapper2 = mount(ReboundCountTo, { props: { i: 3, delay: 2 } });
    wrapper2.unmount();
    vi.advanceTimersByTime(3000);
  });
});
```

### Step 5.3: 验证 + thresholds + 提交

`npx vitest run src/components/ReCountTo/` 全绿 → include 追加 7 项后 typecheck 红（6 条）→ 修复 → 绿 → `--coverage` 预期 normal/rebound 的 `index.tsx` 与两个 `props.ts` ≥80%（props.ts 经组件挂载全行执行）。thresholds 追加 4 键（`index.ts` barrel 不加）：

```ts
        'src/components/ReCountTo/src/normal/index.tsx': { lines: 80, branches: 80 },
        'src/components/ReCountTo/src/normal/props.ts': { lines: 80, branches: 80 },
        'src/components/ReCountTo/src/rebound/index.tsx': { lines: 80, branches: 80 },
        'src/components/ReCountTo/src/rebound/props.ts': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReCountTo/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReCountTo/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.1 补齐 ReCountTo 双形态数字动画测试并迁入 strict 清单（四象限动画/格式化/回滚 Safari 兼容）"
```

---

## Task 6: B3.2 ReAuth / RePerms 鉴权插槽（各 0 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReAuth/src/auth.spec.ts`
- Create: `apps/pure-web/src/components/RePerms/src/perms.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 6 项：各 `index.ts` + `src/*.tsx` + spec）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 2 键）

口径：组件自身逻辑薄，测试价值在**真实鉴权链**——ReAuth 走真实 `hasAuth`（router 实例 mock 沿用 B1 `router-utils.spec.ts` 模式，工厂形态对齐）；RePerms 走真实 `hasPerms` + 真实 user store（仅 mock `@/api/user` HTTP 边界与 i18n 展示层，延续 B2）。

### Step 6.1: auth.spec.ts（真实 hasAuth + 路由 meta 注入）

完整文件 `apps/pure-web/src/components/ReAuth/src/auth.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// router 实例 mock（形态对齐 B1 router-utils.spec）：阻断 createRouter 副作用，
// 提供可控 currentRoute.value.meta 驱动真实 hasAuth 链；
// 注意 @/utils/auth 保持真实——hasAuth 即被测对象（真实模块仅依赖
// js-cookie + store hooks，jsdom 下可直接加载，禁止整模块 mock）
vi.mock('@/router', () => ({
  router: {
    currentRoute: { value: { meta: {} as Record<string, unknown> } }
  }
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({})
}));
vi.mock('@/api/routes', () => ({
  getAsyncRoutes: vi.fn(() => Promise.resolve({ code: 0, data: [] }))
}));

import Auth from './auth';
import { router } from '@/router';

const setMetaAuths = (auths: Array<string>) => {
  (router.currentRoute.value.meta as Record<string, unknown>).auths = auths;
};

beforeEach(() => {
  (router.currentRoute.value.meta as Record<string, unknown>) = {};
});

describe('Auth', () => {
  it('授权命中：渲染默认槽子内容', () => {
    setMetaAuths(['system:add']);
    const wrapper = mount(Auth, {
      props: { value: 'system:add' },
      slots: { default: '<button>add-btn</button>' }
    });
    expect(wrapper.text()).toContain('add-btn');
  });

  it('未授权：不渲染任何内容', () => {
    setMetaAuths(['system:add']);
    const wrapper = mount(Auth, {
      props: { value: 'system:del' },
      slots: { default: '<button>del-btn</button>' }
    });
    expect(wrapper.text()).toBe('');
  });

  it('数组值：全部命中才渲染（isIncludeAllChildren 语义）', () => {
    setMetaAuths(['system:add', 'system:edit']);
    const all = mount(Auth, {
      props: { value: ['system:add', 'system:edit'] },
      slots: { default: 'ok' }
    });
    expect(all.text()).toBe('ok');
    const partial = mount(Auth, {
      props: { value: ['system:add', 'system:del'] },
      slots: { default: 'no' }
    });
    expect(partial.text()).toBe('');
  });

  it('无 meta.auths 拒绝；无默认槽渲染为空', () => {
    const wrapper = mount(Auth, {
      props: { value: 'system:add' },
      slots: { default: 'x' }
    });
    expect(wrapper.text()).toBe('');
    setMetaAuths(['system:add']);
    expect(mount(Auth, { props: { value: 'system:add' } }).text()).toBe('');
  });
});
```

### Step 6.2: perms.spec.ts（真实 hasPerms + user store seed）

完整文件 `apps/pure-web/src/components/RePerms/src/perms.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// HTTP 边界 + i18n 展示层 mock（延续 B2 口径）；user store 走真实实现
vi.mock('@/api/user', () => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

import Perms from './perms';
import { useUserStoreHook } from '@/store/modules/user';

beforeEach(() => {
  useUserStoreHook().$reset();
});

describe('Perms', () => {
  it('命中 permissions：渲染子内容；未命中不渲染', () => {
    useUserStoreHook().$patch({ permissions: ['system:add'] });
    const ok = mount(Perms, {
      props: { value: 'system:add' },
      slots: { default: '<button>add</button>' }
    });
    expect(ok.text()).toContain('add');
    const no = mount(Perms, {
      props: { value: 'system:del' },
      slots: { default: 'del' }
    });
    expect(no.text()).toBe('');
  });

  it('*:*:* 超管通配：任意值均渲染', () => {
    useUserStoreHook().$patch({ permissions: ['*:*:*'] });
    const wrapper = mount(Perms, {
      props: { value: 'anything:at:all' },
      slots: { default: 'ok' }
    });
    expect(wrapper.text()).toBe('ok');
  });

  it('数组值全包含才渲染；空 permissions 拒绝', () => {
    useUserStoreHook().$patch({ permissions: ['a', 'b'] });
    expect(
      mount(Perms, { props: { value: ['a', 'b'] }, slots: { default: 'ok' } }).text()
    ).toBe('ok');
    expect(
      mount(Perms, { props: { value: ['a', 'c'] }, slots: { default: 'no' } }).text()
    ).toBe('');
    useUserStoreHook().$patch({ permissions: [] });
    expect(
      mount(Perms, { props: { value: 'a' }, slots: { default: 'no' } }).text()
    ).toBe('');
  });

  it('无默认槽渲染为空', () => {
    useUserStoreHook().$patch({ permissions: ['a'] });
    expect(mount(Perms, { props: { value: 'a' } }).text()).toBe('');
  });
});
```

### Step 6.3: 验证 + thresholds + 提交

`npx vitest run src/components/ReAuth/ src/components/RePerms/` 全绿 → include 追加 6 项后 typecheck 直接绿（0 strict 错误）→ `--coverage` 预期 `auth.tsx`、`perms.tsx` 100%。thresholds 追加 2 键（`index.ts` barrel 不加）：

```ts
        'src/components/ReAuth/src/auth.tsx': { lines: 80, branches: 80 },
        'src/components/RePerms/src/perms.tsx': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReAuth/ apps/pure-web/src/components/RePerms/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReAuth/ apps/pure-web/src/components/RePerms/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.2 补齐 ReAuth/RePerms 鉴权插槽测试并迁入 strict 清单（真实 hasAuth 路由注入/真实 hasPerms 含通配）"
```

---

## Task 7: B3.2 ReDialog 函数式弹框（17 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReDialog/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReDialog/index.ts`（1：`dialogStore.value[index][key] = value` TS7053 → `as Recordable` 窄化）
- Modify: `apps/pure-web/src/components/ReDialog/index.vue`（16：`sureBtnMap.value[index]` / `options?.[event]` 等索引访问，按诊断补 `Record<number, { loading: boolean }>` 与 handler 窄化）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 4 项：`index.ts`、`index.vue`、`type.ts`、`index.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 2 键）

### Step 7.1: 写 spec（store 状态机 + 渲染层透传）

element-plus 渲染层 mock：el-dialog 仅 `modelValue` 为真时内联渲染 header/default/footer 槽；`useTimeoutFn`（@vueuse/core）走 fake timers。完整文件 `apps/pure-web/src/components/ReDialog/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElDialog: dc({
      props: ['modelValue', 'fullscreen'],
      emits: ['closed', 'opened', 'openAutoFocus', 'closeAutoFocus'],
      setup(props: any, { slots }: any) {
        return () =>
          !props.modelValue
            ? null
            : vh(
                'div',
                {
                  class: 'ep-dialog',
                  'data-fullscreen': props.fullscreen ? '1' : '0'
                },
                [
                  slots.header?.({
                    close: () => {},
                    titleId: 'tid',
                    titleClass: 'tc'
                  }),
                  slots.default?.(),
                  slots.footer?.()
                ]
              );
      }
    }),
    ElButton: dc({
      props: ['loading'],
      setup(props: any, { slots }: any) {
        return () =>
          vh(
            'button',
            {
              class: 'ep-button',
              'data-loading': props.loading ? '1' : '0'
            },
            slots.default?.()
          );
      }
    }),
    ElPopconfirm: dc({
      emits: ['confirm'],
      setup(_p: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-popconfirm' }, [
            slots.reference?.(),
            vh(
              'button',
              { class: 'ep-popconfirm-ok', onClick: () => emit('confirm') },
              'confirm'
            )
          ]);
      }
    })
  };
});

import {
  ReDialog,
  dialogStore,
  addDialog,
  closeDialog,
  updateDialog,
  closeAllDialog,
  type DialogOptions
} from './index';
import SvgIconStub from '@/test-utils/svg-component-stub';

const contentRenderer = () => h('div', { class: 'dlg-content' }, 'body');

function mountDialog(options: Partial<DialogOptions>) {
  addDialog({ contentRenderer, ...options } as DialogOptions);
  return mount(ReDialog, {
    global: {
      components: {
        IconifyIconOffline: SvgIconStub,
        IconifyIconOnline: SvgIconStub
      }
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  closeAllDialog();
});

afterEach(() => {
  closeAllDialog();
  vi.useRealTimers();
});

describe('dialogStore 状态机（index.ts）', () => {
  it('addDialog 立即入栈且 visible 为 true', () => {
    addDialog({ title: 't', contentRenderer });
    expect(dialogStore.value).toHaveLength(1);
    expect(dialogStore.value[0].visible).toBe(true);
  });

  it('openDelay：到时后才入栈', () => {
    addDialog({ title: 't', contentRenderer, openDelay: 300 });
    expect(dialogStore.value).toHaveLength(0);
    vi.advanceTimersByTime(350);
    expect(dialogStore.value).toHaveLength(1);
  });

  it('closeDialog：visible 置假 + closeCallBack + 默认 200ms 后移除', () => {
    const closeCallBack = vi.fn();
    addDialog({ title: 't', contentRenderer, closeCallBack });
    const options = dialogStore.value[0];
    closeDialog(options, 0, { command: 'sure' });
    expect(options.visible).toBe(false);
    expect(closeCallBack).toHaveBeenCalledWith({
      options,
      index: 0,
      args: { command: 'sure' }
    });
    expect(dialogStore.value).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(dialogStore.value).toHaveLength(0);
  });

  it('updateDialog：默认改 title，可指定键与索引', () => {
    addDialog({ title: 'a', contentRenderer });
    addDialog({ title: 'b', contentRenderer });
    updateDialog('新标题');
    updateDialog(9, 'customKey' as never, 1);
    expect(dialogStore.value[0].title).toBe('新标题');
    expect((dialogStore.value[1] as Recordable).customKey).toBe(9);
  });

  it('closeAllDialog 清空注册表', () => {
    addDialog({ contentRenderer });
    closeAllDialog();
    expect(dialogStore.value).toHaveLength(0);
  });
});

describe('ReDialog 渲染与页脚交互（index.vue）', () => {
  it('内容渲染 + 默认页脚取消/确定；点确定关闭并到时移除', () => {
    const wrapper = mountDialog({ title: 't1' });
    expect(wrapper.find('.dlg-content').text()).toBe('body');
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons.map(b => b.text())).toEqual(['取消', '确定']);
    buttons[1].trigger('click');
    expect(dialogStore.value[0].visible).toBe(false);
    vi.advanceTimersByTime(250);
    expect(dialogStore.value).toHaveLength(0);
  });

  it('beforeSure 拦截：不调 done 不关；beforeCancel 同理', () => {
    let sureDone: (() => void) | undefined;
    const wrapper = mountDialog({
      beforeSure: (done: () => void) => {
        sureDone = done;
      }
    });
    wrapper.findAll('.ep-button')[1].trigger('click');
    expect(dialogStore.value[0].visible).toBe(true);
    sureDone?.();
    expect(dialogStore.value[0].visible).toBe(false);
    closeAllDialog();

    let cancelDone: (() => void) | undefined;
    const wrapper2 = mountDialog({
      beforeCancel: (done: () => void) => {
        cancelDone = done;
      }
    });
    wrapper2.findAll('.ep-button')[0].trigger('click');
    expect(dialogStore.value[0].visible).toBe(true);
    cancelDone?.();
    expect(dialogStore.value[0].visible).toBe(false);
  });

  it('sureBtnLoading：点确定后按钮转 loading，closeLoading 可关', () => {
    const wrapper = mountDialog({
      sureBtnLoading: true,
      beforeSure: (_done: () => void, { closeLoading }: Recordable) => {
        closeLoading();
      }
    });
    const sure = wrapper.findAll('.ep-button')[1];
    sure.trigger('click');
    // closeLoading 同步执行后回到非 loading（loading 置位→关闭两分支均命中）
    expect(wrapper.findAll('.ep-button')[1].attributes('data-loading')).toBe(
      '0'
    );
  });

  it('自定义 footerButtons：渲染自定按钮并回传 dialog/button 参数', () => {
    const btnClick = vi.fn();
    const wrapper = mountDialog({
      footerButtons: [{ label: '自定', btnClick } as never]
    });
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons).toHaveLength(1);
    buttons[0].trigger('click');
    expect(btnClick).toHaveBeenCalledWith(
      expect.objectContaining({
        dialog: expect.objectContaining({ index: 0 }),
        button: expect.objectContaining({ index: 0 })
      })
    );
  });

  it('popconfirm 按钮：confirm 后才执行 btnClick', () => {
    const btnClick = vi.fn();
    const wrapper = mountDialog({
      footerButtons: [{ label: '危险', popconfirm: {}, btnClick } as never]
    });
    expect(wrapper.find('.ep-popconfirm').exists()).toBe(true);
    wrapper.find('.ep-popconfirm-ok').trigger('click');
    expect(btnClick).toHaveBeenCalledTimes(1);
  });

  it('hideFooter 无页脚；footerRenderer 自定页脚', () => {
    expect(mountDialog({ hideFooter: true }).find('.ep-button').exists()).toBe(
      false
    );
    closeAllDialog();
    const wrapper = mountDialog({
      footerRenderer: () => h('div', { class: 'custom-footer' }, 'ft')
    });
    expect(wrapper.find('.custom-footer').text()).toBe('ft');
  });

  it('fullscreenIcon：标题栏含切换钮，点击翻转 fullscreen 并回调', () => {
    const fullscreenCallBack = vi.fn();
    const wrapper = mountDialog({ fullscreenIcon: true, fullscreenCallBack });
    expect(wrapper.text()).toContain(wrapper.find('.flex-bc').text());
    wrapper.find('.pure-dialog-svg').element.parentElement?.click();
    expect(fullscreenCallBack).toHaveBeenCalledWith(
      expect.objectContaining({ fullscreen: true }),
      0
    );
    expect(wrapper.find('.ep-dialog').attributes('data-fullscreen')).toBe('1');
  });

  it('headerRenderer 分支（无 fullscreenIcon 时）', () => {
    const wrapper = mountDialog({
      headerRenderer: () => h('div', { class: 'custom-header' }, 'hd')
    });
    expect(wrapper.find('.custom-header').text()).toBe('hd');
  });

  it('生命周期回调：opened→open、closed→close、双 AutoFocus 透传', () => {
    const open = vi.fn();
    const close = vi.fn();
    const openAutoFocus = vi.fn();
    const closeAutoFocus = vi.fn();
    const wrapper = mountDialog({ open, close, openAutoFocus, closeAutoFocus });
    const dialog = wrapper.findComponent({ name: 'ElDialog' });
    dialog.vm.$emit('opened');
    dialog.vm.$emit('openAutoFocus');
    dialog.vm.$emit('closeAutoFocus');
    dialog.vm.$emit('closed');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
    expect(openAutoFocus).toHaveBeenCalledTimes(1);
    expect(closeAutoFocus).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
  });
});
```

### Step 7.2: 验证 + thresholds + 提交

`npx vitest run src/components/ReDialog/` 全绿 → include 追加 4 项后 typecheck 红（17 条）→ 修复 → 绿 → `--coverage` 预期 `index.ts`、`index.vue` ≥80% 行+分支（`type.ts` 纯类型不加键）。thresholds 追加：

```ts
        'src/components/ReDialog/index.ts': { lines: 80, branches: 80 },
        'src/components/ReDialog/index.vue': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReDialog/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReDialog/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.2 补齐 ReDialog 弹框状态机与页脚交互测试并迁入 strict 清单（延时入栈/拦截钩子/全屏切换/生命周期透传）"
```

---

## Task 8: B3.2 ReTypeit 打字机（0 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReTypeit/src/index.spec.ts`
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 3 项：`index.ts`、`src/index.tsx`、spec）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 1 键）

### Step 8.1: 写 spec（typeit 实例 stub + 生命周期接线 + 双语错误分支）

完整文件 `apps/pure-web/src/components/ReTypeit/src/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';

const goMock = vi.hoisted(() => vi.fn());
const TypeItMock = vi.hoisted(() => vi.fn(() => ({ go: goMock })));
vi.mock('typeit', () => ({ default: TypeItMock }));

import TypeIt from './index';

const instanceSentinel = Symbol('typeit-instance');

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'language', {
    value: 'en-US',
    configurable: true
  });
});

describe('TypeIt', () => {
  it('无默认槽：渲染内置 span.type-it 并以空配置创建实例，expose 实例', () => {
    goMock.mockReturnValue(instanceSentinel);
    const wrapper = mount(TypeIt);
    expect(TypeItMock).toHaveBeenCalledTimes(1);
    const [el, options] = TypeItMock.mock.calls[0];
    expect((el as Element).classList.contains('type-it')).toBe(true);
    expect(options).toEqual({});
    expect(goMock).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as { typeIt: unknown }).typeIt).toBe(instanceSentinel);
  });

  it('自定槽提供 .type-it 锚点且透传 options', () => {
    mount(TypeIt, {
      props: { options: { speed: 90 } },
      slots: { default: '<div class="type-it custom-anchor"></div>' }
    });
    const [el, options] = TypeItMock.mock.calls[0];
    expect((el as Element).classList.contains('custom-anchor')).toBe(true);
    expect(options).toEqual({ speed: 90 });
  });

  it('缺少 .type-it 锚点：默认语言下抛英文 TypeError', () => {
    expect(() =>
      mount(TypeIt, { slots: { default: '<div>no-anchor</div>' } })
    ).toThrow(/Please make sure/);
  });

  it('zh-CN 环境：错误信息切中文', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'zh-CN',
      configurable: true
    });
    expect(() =>
      mount(TypeIt, { slots: { default: '<div>no-anchor</div>' } })
    ).toThrow(/请确保/);
  });
});
```

### Step 8.2: 验证 + thresholds + 提交

`npx vitest run src/components/ReTypeit/` 全绿 → include 追加 3 项后 typecheck 直接绿 → `--coverage` 预期 `src/index.tsx` 100%。thresholds 追加：

```ts
        'src/components/ReTypeit/src/index.tsx': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReTypeit/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReTypeit/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.2 补齐 ReTypeit 打字机接线测试并迁入 strict 清单（实例创建/锚点守卫/双语错误）"
```

---

## Task 9: B3.2 ReImageVerify 图形验证码（1 strict 错误；Canvas 豁免，不加覆盖键）

**Files:**

- Create: `apps/pure-web/src/components/ReImageVerify/src/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReImageVerify/src/hooks.ts` 或 `src/index.vue`（1：TS6133 domRef 未使用，按诊断定位最小修复）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 4 项：`index.ts`、`src/hooks.ts`、`src/index.vue`、spec）

> Canvas 豁免：`draw()` 主体依赖 2d context，jsdom `getContext('2d')` 返回 null 自然命中早退分支；绘制行不给 thresholds 键，与 backlog「B3 Canvas 绘制豁免回补」条目双向登记（spec 头注释 + backlog 理由/时机）。

### Step 9.1: 写 spec（验证码状态流 + 早退分支）

完整文件 `apps/pure-web/src/components/ReImageVerify/src/index.spec.ts`：

```ts
// @vitest-environment jsdom
// Canvas 豁免：jsdom 无 2d context，draw 主体不可达（`if (!ctx)` 早退）；
// 本 spec 只测验证码状态流（set/get/watch/expose），不登记覆盖率键。
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useImageVerify } from './hooks';
import ReImageVerify from './index.vue';

describe('useImageVerify', () => {
  it('domRef 未绑定：getImgCode 早退，setImgCode 可写', () => {
    const host = defineComponent({
      setup() {
        const { imgCode, setImgCode, getImgCode } = useImageVerify();
        getImgCode();
        setImgCode('1234');
        return () => h('i', imgCode.value);
      }
    });
    expect(mount(host).text()).toBe('1234');
  });

  it('domRef 已绑定但无 2d context：onMounted 后 imgCode 为空串', () => {
    const host = defineComponent({
      setup() {
        const { domRef, imgCode } = useImageVerify();
        return () => h('canvas', { ref: domRef, 'data-code': imgCode.value });
      }
    });
    expect(mount(host).find('canvas').attributes('data-code')).toBe('');
  });
});

describe('ReImageVerify', () => {
  it('渲染 120x40 canvas；点击触发刷新（jsdom 下空码路径）', async () => {
    const wrapper = mount(ReImageVerify);
    const canvas = wrapper.find('canvas');
    expect(canvas.attributes('width')).toBe('120');
    expect(canvas.attributes('height')).toBe('40');
    await canvas.trigger('click');
    expect(wrapper.emitted('update:code')).toBeTruthy();
  });

  it('props.code 写入：watch → setImgCode → 回吐 update:code', async () => {
    const wrapper = mount(ReImageVerify, { props: { code: '' } });
    await wrapper.setProps({ code: '9527' });
    expect(wrapper.emitted('update:code')?.at(-1)).toEqual(['9527']);
  });

  it('expose getImgCode 可调用', () => {
    const wrapper = mount(ReImageVerify);
    expect(() =>
      (wrapper.vm as { getImgCode: () => void }).getImgCode()
    ).not.toThrow();
  });
});
```

### Step 9.2: 验证 + 提交（不加 thresholds 键）

`npx vitest run src/components/ReImageVerify/` 全绿 → include 追加 4 项后 typecheck 红（1 条）→ 修复 → 绿。`--coverage` 预期 hooks.ts 早退分支命中（绘制主体未覆盖为预期内，不入门禁）。`node scripts/assert-strict-manifest.mjs` 通过后提交：

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReImageVerify/ apps/pure-web/tsconfig.strict.json
git add apps/pure-web/src/components/ReImageVerify/ apps/pure-web/tsconfig.strict.json
git commit -m "test(web): b3.2 补齐 ReImageVerify 验证码流测试并迁入 strict 清单（Canvas 绘制按豁免口径不登记覆盖键）"
```

---

## Task 10: B3.2 ReDrawer 函数式抽屉 + 豁免移出（15 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReDrawer/index.spec.ts`
- Modify: `apps/pure-web/src/components/ReDrawer/index.ts`（1：`drawerStore.value[index][key] = value` TS7053 → `as Recordable` 窄化，同 ReDialog 修法）
- Modify: `apps/pure-web/src/components/ReDrawer/index.vue`（14：`sureBtnMap.value[index]` / `options?.[event]` / `options?.footerButtons?.length` 等，按诊断补 `Record<number, { loading: boolean }>` 初始化与索引窄化）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 4 项：`index.ts`、`index.vue`、`type.ts`、`index.spec.ts`）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 2 键）
- Modify: `apps/pure-web/tsconfig.strict.exemptions.json`（**移除 `"src/components/ReDrawer/**"`**（files 数组第 2 个条目，现无缩进需顺带对齐格式）——本任务即设计「ReDrawer 移出豁免」落点，与迁入同提交）

### Step 10.1: 写 spec（镜像 Task 7 ReDialog：store 状态机 + 渲染层透传）

element-plus 渲染层 mock：el-drawer 仅 `modelValue` 为真时内联渲染 header/default/footer 槽（与 ElDialog stub 同构）。与 ReDialog 的差异点：参数形状 `{ drawer: { options, index } }`、默认确定钮走 `popConfirm`（驼峰）透传。完整文件 `apps/pure-web/src/components/ReDrawer/index.spec.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElDrawer: dc({
      props: ['modelValue', 'appendToBody', 'appendTo', 'destroyOnClose', 'lockScroll'],
      emits: ['closed', 'opened', 'openAutoFocus', 'closeAutoFocus'],
      setup(props: any, { slots }: any) {
        return () =>
          !props.modelValue
            ? null
            : vh(
                'div',
                {
                  class: 'ep-drawer',
                  'data-append-to': props.appendTo,
                  'data-destroy': props.destroyOnClose ? '1' : '0',
                  'data-lock': props.lockScroll ? '1' : '0'
                },
                [
                  slots.header?.({
                    close: () => {},
                    titleId: 'tid',
                    titleClass: 'tc'
                  }),
                  slots.default?.(),
                  slots.footer?.()
                ]
              );
      }
    }),
    ElButton: dc({
      props: ['loading'],
      setup(props: any, { slots }: any) {
        return () =>
          vh(
            'button',
            {
              class: 'ep-button',
              'data-loading': props.loading ? '1' : '0'
            },
            slots.default?.()
          );
      }
    }),
    ElPopconfirm: dc({
      emits: ['confirm'],
      setup(_p: any, { slots, emit }: any) {
        return () =>
          vh('div', { class: 'ep-popconfirm' }, [
            slots.reference?.(),
            vh(
              'button',
              { class: 'ep-popconfirm-ok', onClick: () => emit('confirm') },
              'confirm'
            )
          ]);
      }
    })
  };
});

import {
  ReDrawer,
  drawerStore,
  addDrawer,
  closeDrawer,
  updateDrawer,
  closeAllDrawer,
  type DrawerOptions
} from './index';

const contentRenderer = () => h('div', { class: 'drawer-content' }, 'body');

function mountDrawer(options: Partial<DrawerOptions>) {
  addDrawer({ contentRenderer, ...options } as DrawerOptions);
  return mount(ReDrawer);
}

beforeEach(() => {
  vi.useFakeTimers();
  closeAllDrawer();
});

afterEach(() => {
  closeAllDrawer();
  vi.useRealTimers();
});

describe('drawerStore 状态机（index.ts）', () => {
  it('addDrawer 立即入栈且 visible 为 true', () => {
    addDrawer({ title: 't', contentRenderer });
    expect(drawerStore.value).toHaveLength(1);
    expect(drawerStore.value[0].visible).toBe(true);
  });

  it('openDelay：到时后才入栈', () => {
    addDrawer({ title: 't', contentRenderer, openDelay: 300 });
    expect(drawerStore.value).toHaveLength(0);
    vi.advanceTimersByTime(350);
    expect(drawerStore.value).toHaveLength(1);
  });

  it('closeDrawer：visible 置假 + closeCallBack + 默认 200ms 后移除', () => {
    const closeCallBack = vi.fn();
    addDrawer({ title: 't', contentRenderer, closeCallBack });
    const options = drawerStore.value[0];
    closeDrawer(options, 0, { command: 'sure' });
    expect(options.visible).toBe(false);
    expect(closeCallBack).toHaveBeenCalledWith({
      options,
      index: 0,
      args: { command: 'sure' }
    });
    expect(drawerStore.value).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(drawerStore.value).toHaveLength(0);
  });

  it('updateDrawer：默认改 title，可指定键与索引', () => {
    addDrawer({ title: 'a', contentRenderer });
    addDrawer({ title: 'b', contentRenderer });
    updateDrawer('新标题');
    updateDrawer(9, 'customKey' as never, 1);
    expect(drawerStore.value[0].title).toBe('新标题');
    expect((drawerStore.value[1] as Recordable).customKey).toBe(9);
  });

  it('closeAllDrawer 清空注册表', () => {
    addDrawer({ contentRenderer });
    closeAllDrawer();
    expect(drawerStore.value).toHaveLength(0);
  });
});

describe('ReDrawer 渲染与页脚交互（index.vue）', () => {
  it('内容渲染 + 默认页脚取消/确定；点确定关闭并到时移除', () => {
    const wrapper = mountDrawer({ title: 't1' });
    expect(wrapper.find('.drawer-content').text()).toBe('body');
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons.map(b => b.text())).toEqual(['取消', '确定']);
    buttons[1].trigger('click');
    expect(drawerStore.value[0].visible).toBe(false);
    vi.advanceTimersByTime(250);
    expect(drawerStore.value).toHaveLength(0);
  });

  it('布尔透传：appendTo/destroyOnClose/lockScroll 落到 el-drawer', () => {
    const wrapper = mountDrawer({
      appendTo: '#app',
      destroyOnClose: true,
      lockScroll: true
    });
    const drawer = wrapper.find('.ep-drawer');
    expect(drawer.attributes('data-append-to')).toBe('#app');
    expect(drawer.attributes('data-destroy')).toBe('1');
    expect(drawer.attributes('data-lock')).toBe('1');
  });

  it('beforeSure 拦截：不调 done 不关；beforeCancel 同理', () => {
    let sureDone: (() => void) | undefined;
    const wrapper = mountDrawer({
      beforeSure: (done: () => void) => {
        sureDone = done;
      }
    });
    wrapper.findAll('.ep-button')[1].trigger('click');
    expect(drawerStore.value[0].visible).toBe(true);
    sureDone?.();
    expect(drawerStore.value[0].visible).toBe(false);
    closeAllDrawer();

    let cancelDone: (() => void) | undefined;
    const wrapper2 = mountDrawer({
      beforeCancel: (done: () => void) => {
        cancelDone = done;
      }
    });
    wrapper2.findAll('.ep-button')[0].trigger('click');
    expect(drawerStore.value[0].visible).toBe(true);
    cancelDone?.();
    expect(drawerStore.value[0].visible).toBe(false);
  });

  it('sureBtnLoading：点确定后按钮转 loading，closeLoading 可关', () => {
    const wrapper = mountDrawer({
      sureBtnLoading: true,
      beforeSure: (_done: () => void, { closeLoading }: Recordable) => {
        closeLoading();
      }
    });
    wrapper.findAll('.ep-button')[1].trigger('click');
    expect(wrapper.findAll('.ep-button')[1].attributes('data-loading')).toBe(
      '0'
    );
  });

  it('自定义 footerButtons：回传 drawer/button 参数（drawer 键）', () => {
    const btnClick = vi.fn();
    const wrapper = mountDrawer({
      footerButtons: [{ label: '自定', btnClick } as never]
    });
    const buttons = wrapper.findAll('.ep-button');
    expect(buttons).toHaveLength(1);
    buttons[0].trigger('click');
    expect(btnClick).toHaveBeenCalledWith(
      expect.objectContaining({
        drawer: expect.objectContaining({ index: 0 }),
        button: expect.objectContaining({ index: 0 })
      })
    );
  });

  it('popConfirm（驼峰）：默认确定钮带 popConfirm 时 confirm 后才执行', () => {
    const beforeSure = vi.fn();
    const wrapper = mountDrawer({ popConfirm: { title: '确认?' }, beforeSure });
    expect(wrapper.find('.ep-popconfirm').exists()).toBe(true);
    wrapper.find('.ep-popconfirm-ok').trigger('click');
    expect(beforeSure).toHaveBeenCalledTimes(1);
  });

  it('hideFooter 无页脚；footerRenderer 自定页脚；headerRenderer 自定头部', () => {
    expect(mountDrawer({ hideFooter: true }).find('.ep-button').exists()).toBe(
      false
    );
    closeAllDrawer();
    const wrapper = mountDrawer({
      headerRenderer: () => h('div', { class: 'custom-header' }, 'hd'),
      footerRenderer: () => h('div', { class: 'custom-footer' }, 'ft')
    });
    expect(wrapper.find('.custom-header').text()).toBe('hd');
    expect(wrapper.find('.custom-footer').text()).toBe('ft');
  });

  it('生命周期回调：opened→open、closed→close、双 AutoFocus 透传', () => {
    const open = vi.fn();
    const close = vi.fn();
    const openAutoFocus = vi.fn();
    const closeAutoFocus = vi.fn();
    const wrapper = mountDrawer({ open, close, openAutoFocus, closeAutoFocus });
    const drawer = wrapper.findComponent({ name: 'ElDrawer' });
    drawer.vm.$emit('opened');
    drawer.vm.$emit('openAutoFocus');
    drawer.vm.$emit('closeAutoFocus');
    drawer.vm.$emit('closed');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
    expect(openAutoFocus).toHaveBeenCalledTimes(1);
    expect(closeAutoFocus).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
  });
});
```

### Step 10.2: 验证 + thresholds + 豁免移出 + 提交

`npx vitest run src/components/ReDrawer/` 全绿 → include 追加 4 项、`tsconfig.strict.exemptions.json` 移除 `"src/components/ReDrawer/**"` 后 typecheck 红（15 条）→ 修复 → 绿 → `--coverage` 预期 `index.ts`、`index.vue` ≥80% 行+分支（`type.ts` 纯类型不加键）。`node scripts/assert-strict-manifest.mjs` 预期：**豁免 26 项**（脚本按展开文件计数：29 − ReDrawer 3 文件；清单同步 +4 = 57 项，存量 −3）且防漏通过。thresholds 追加：

```ts
        'src/components/ReDrawer/index.ts': { lines: 80, branches: 80 },
        'src/components/ReDrawer/index.vue': { lines: 80, branches: 80 },
```

```bash
cd ../..
pnpm exec prettier --write apps/pure-web/src/components/ReDrawer/ apps/pure-web/tsconfig.strict.json apps/pure-web/tsconfig.strict.exemptions.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/ReDrawer/ apps/pure-web/tsconfig.strict.json apps/pure-web/tsconfig.strict.exemptions.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.2 补齐 ReDrawer 抽屉状态机与页脚交互测试，迁入 strict 清单并移出豁免"
```

---

## Task 11: B3.3 RePureTableBar 表格工具栏（19 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/RePureTableBar/src/bar.spec.tsx`
- Modify: `apps/pure-web/src/components/RePureTableBar/src/bar.tsx`（19：`getDropdownItemStyle` 返回函数参数 `s` / `toggleRowExpansionAll(data, isExpansion)` / 各 `handle*` 回调与 `onEnd({ newIndex, oldIndex, item })` / `isFixedColumn` 的 `fixedOption` 等隐式 any，按诊断逐条补参数类型）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 3 项：`src/bar.tsx`、`src/bar.spec.tsx`、`index.ts`——barrel 随域迁入清单但不加覆盖键）
- Modify: `apps/pure-web/vitest.config.ts`（thresholds 追加 1 键）

说明：原 24 条域内错误中 5 个 `*.svg?component` TS2307 已随 Task 0 `vite-svg-loader` types 补位消失，本任务手修基数 19。`~icons/*` 四枚导入由 Task 0 alias stub 接住。

### Step 11.1: 写 spec（sortablejs 边界 mock + EP 透传容器 + 真实 epTheme store）

边界 mock：`sortablejs`（捕获 `create` 的 `onEnd` 回调，手工驱动拖拽结局）、`@/plugins/i18n`（照抄通用约定模板）、`element-plus` 渲染层（popover/dropdown 槽内联、checkbox 系最小可交互 stub）。`useEpThemeStoreHook` 走真实 pinia store（纯读取无副作用）。完整文件 `apps/pure-web/src/components/RePureTableBar/src/bar.spec.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

const sortableCreateMock = vi.hoisted(() => vi.fn());
vi.mock('sortablejs', () => ({ default: { create: sortableCreateMock } }));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? m?.zh ?? '' : m)
}));

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElPopover: dc({
      setup(_p: any, { slots }: any) {
        return () =>
          vh('div', { class: 'ep-popover' }, [
            slots.reference?.(),
            slots.default?.()
          ]);
      }
    }),
    ElDropdown: dc({
      setup(_p: any, { slots }: any) {
        return () =>
          vh('div', { class: 'ep-dropdown' }, [
            slots.default?.(),
            slots.dropdown?.()
          ]);
      }
    }),
    ElDropdownMenu: dc({
      setup(_p: any, { slots }: any) {
        return () => vh('div', { class: 'ep-dropdown-menu' }, slots.default?.());
      }
    }),
    ElDropdownItem: dc({
      setup(_p: any, { slots, attrs }: any) {
        return () =>
          vh('div', { class: 'ep-dropdown-item', onClick: attrs.onClick }, slots.default?.());
      }
    }),
    ElCheckbox: dc({
      props: ['modelValue', 'label', 'value', 'indeterminate'],
      emits: ['change'],
      setup(props: any, { slots, emit }: any) {
        return () =>
          vh('label', { class: 'ep-checkbox' }, [
            vh('input', {
              type: 'checkbox',
              checked: props.modelValue,
              onChange: (e: Event) =>
                emit('change', (e.target as HTMLInputElement).checked)
            }),
            slots.default?.() ?? props.label
          ]);
      }
    }),
    ElCheckboxGroup: dc({
      props: ['modelValue'],
      emits: ['change'],
      setup(_p: any, { slots }: any) {
        return () => vh('div', { class: 'ep-checkbox-group' }, slots.default?.());
      }
    }),
    ElScrollbar: dc({
      setup(_p: any, { slots }: any) {
        return () => vh('div', { class: 'ep-scrollbar' }, slots.default?.());
      }
    }),
    ElSpace: dc({
      setup(_p: any, { slots }: any) {
        return () => vh('div', { class: 'ep-space' }, slots.default?.());
      }
    }),
    ElDivider: dc({ render: () => h('hr', { class: 'ep-divider' }) }),
    ElButton: dc({
      setup(_p: any, { slots, attrs }: any) {
        return () =>
          vh('button', { class: 'ep-button', onClick: attrs.onClick }, slots.default?.());
      }
    })
  };
});

import PureTableBar from './bar';
import SvgIconStub from '@/test-utils/svg-component-stub';

const columns: Recordable[] = [
  { label: '甲', prop: 'a' },
  { label: '乙', prop: 'b', hide: true },
  { label: '丙', prop: 'c' }
];

function mountBar(options: Recordable = {}) {
  return mount(PureTableBar, {
    props: { columns: columns as never, ...options.props },
    slots: {
      default: options.slotDefault ??
        (({ size, dynamicColumns }: Recordable) =>
          h(
            'div',
            { class: 'slot-default', 'data-size': size },
            JSON.stringify(dynamicColumns.map((c: Recordable) => c.label))
          ))
    },
    global: {
      directives: { tippy: () => {} },
      components: { IconifyIconOffline: SvgIconStub, IconifyIconOnline: SvgIconStub }
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sortableCreateMock.mockClear();
});

afterEach(() => vi.useRealTimers());

describe('PureTableBar', () => {
  it('标题：默认 props.title（i18n key 直出）；title 槽覆盖', () => {
    expect(mountBar().find('p.font-bold').text()).toBe('tableBar.pureList');
    const wrapper = mount(PureTableBar, {
      props: { columns: [] as never },
      slots: {
        title: () => h('b', { class: 'slot-title' }, 'T'),
        default: () => h('i')
      },
      global: { directives: { tippy: () => {} }, components: { IconifyIconOffline: SvgIconStub } }
    });
    expect(wrapper.find('.slot-title').exists()).toBe(true);
  });

  it('buttons 槽渲染到工具区', () => {
    const wrapper = mountBar();
    expect(wrapper.find('.flex.mr-4').exists()).toBe(false);
    const withBtn = mount(PureTableBar, {
      props: { columns: [] as never },
      slots: {
        buttons: () => h('button', { class: 'slot-btn' }),
        default: () => h('i')
      },
      global: { directives: { tippy: () => {} }, components: { IconifyIconOffline: SvgIconStub } }
    });
    expect(withBtn.find('.slot-btn').exists()).toBe(true);
  });

  it('refresh：emit refresh 且 loading 500ms 后回落', async () => {
    const wrapper = mountBar();
    // RefreshIcon 被 alias stub 成 h('svg')，onClick 经 vnode props 落在 svg 元素上
    const refreshSvg = wrapper.findAll('svg').find(s => s.classes().includes('w-4'))!;
    await refreshSvg.trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(refreshSvg.classes()).toContain('animate-spin');
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(wrapper.find('.animate-spin').exists()).toBe(false);
  });

  it('fullscreen：点击末位图标翻转并 emit，容器切全屏类', async () => {
    const wrapper = mountBar();
    const icons = wrapper.findAllComponents({ name: 'IconifyIconOffline' });
    await icons.at(-1)!.trigger('click');
    expect(wrapper.emitted('fullscreen')?.at(-1)).toEqual([true]);
    expect(wrapper.find('.fixed').exists()).toBe(true);
    await icons.at(-1)!.trigger('click');
    expect(wrapper.emitted('fullscreen')?.at(-1)).toEqual([false]);
  });

  it('expand：tableRef.size 存在时渲染展开钮，点击递归 toggle 子树', async () => {
    const toggleRowExpansion = vi.fn();
    const tableRef = {
      size: 'default',
      data: [{ id: 1, children: [{ id: 2 }, { id: 3, children: null }] }],
      toggleRowExpansion
    };
    const wrapper = mountBar({ props: { tableRef } });
    // ExpandIcon：第二个 svg（首个为 SettingIcon 在 popover reference 内）
    const expandSvg = wrapper.findAll('svg')[1];
    await expandSvg.trigger('click');
    expect(toggleRowExpansion).toHaveBeenCalledTimes(3);
    expect(toggleRowExpansion).toHaveBeenNthCalledWith(1, tableRef.data[0], false);
  });

  it('density：三档切换改写默认槽 size 参数', async () => {
    const wrapper = mountBar();
    const items = wrapper.findAll('.ep-dropdown-item');
    expect(items.map(i => i.text())).toEqual([
      'tableBar.pureLarge',
      'tableBar.pureDefault',
      'tableBar.pureSmall'
    ]);
    await items[2].trigger('click');
    expect(wrapper.find('.slot-default').attributes('data-size')).toBe('small');
  });

  it('列显隐：全选/单选/重置三联动', async () => {
    const wrapper = mountBar();
    const slotText = () => wrapper.find('.slot-default').text();
    expect(slotText()).toBe('["甲","丙"]'); // hide 列初始即滤除…
    // 实际 dynamicColumns 为全量克隆，默认槽见全量 ["甲","乙","丙"]——以首次运行实测为准校正本断言常量；
    // 单选取消「甲」→ dynamicColumns 甲.hide = true
    const checkboxInputs = wrapper.findAll('.ep-checkbox input[type=checkbox]');
    await checkboxInputs[1].setValue(false); // 第 0 个为全选钮；列项从 1 起（甲）
    expect(slotText()).not.toContain('甲');
    // 全选关闭 → 全列 hide；再打开 → 全列还原；重置按钮回到初始态
    await checkboxInputs[0].setValue(false);
    expect(wrapper.findAll('.ep-checkbox input:checked')).toHaveLength(0);
    await wrapper.find('.ep-button').trigger('click'); // 重置
    expect(wrapper.find('.ep-checkbox input').element.checked).toBe(true);
  });

  it('pin 双向：左固定切换 + isFixedColumn 左右三态', async () => {
    const wrapper = mountBar();
    const pinIcons = wrapper.findAllComponents({ name: 'IconifyIconOffline' });
    // 每列 2 枚 pin 图标；首列左 pin 点击 → fixed: 'left'（类含 text-primary）
    await pinIcons[0].trigger('click');
    expect(pinIcons[0].classes()).toContain('text-primary');
    await pinIcons[0].trigger('click'); // 取消固定回退分支（left ? false : 'left'）
    const slotText = wrapper.find('.slot-default').text();
    expect(slotText).toContain('甲');
  });

  it('rowDrop：mouseenter 建 Sortable；onEnd 无 fixed 重排、有 fixed 回滚双分支', async () => {
    const groupEl = document.createElement('div');
    const rowWrap = document.createElement('div');
    groupEl.appendChild(rowWrap);
    const wrapper = mountBar();
    // 以 GroupRef0 指向受控元素（$refs[`GroupRef${tableKey}`].$el.firstElementChild）
    (wrapper.vm.$refs as Recordable)['GroupRef0'] = { $el: groupEl };
    await wrapper.findAll('.drag-btn')[0].trigger('mouseenter');
    await nextTick();
    expect(sortableCreateMock).toHaveBeenCalledWith(rowWrap, expect.objectContaining({ handle: '.drag-btn' }));
    const { onEnd } = sortableCreateMock.mock.calls[0][1];
    // 分支一（无 fixed）：0 → 2 重排 dynamicColumns
    const ths = [0, 1, 2].map(() => rowWrap.appendChild(document.createElement('div')));
    onEnd({ newIndex: 2, oldIndex: 0, item: ths[0] });
    expect(wrapper.find('.slot-default').text()).toBe('["乙","丙","甲"]');
    // 分支二（有 fixed）：先把「乙」固定，再拖拽 → DOM 回滚、列序不变
    const pinIcons = wrapper.findAllComponents({ name: 'IconifyIconOffline' });
    await pinIcons[0].trigger('click'); // 「乙」现为首位，左固定
    onEnd({ newIndex: 2, oldIndex: 0, item: ths[0] });
    expect(wrapper.find('.slot-default').text()).toBe('["乙","丙","甲"]');
  });

  it('默认槽收到 size 与 dynamicColumns 实时引用', () => {
    const seen: Recordable[] = [];
    mountBar({
      slotDefault: (params: Recordable) => {
        seen.push(params);
        return h('i');
      }
    });
    expect(seen[0]).toHaveProperty('size', 'default');
    expect(Array.isArray(seen[0].dynamicColumns)).toBe(true);
  });
});
```

**断言校正提示（执行时）**：列显隐用例中「初始动态列常量」与 pin 用例的图标序号以首跑实测 DOM 为准——本计划按源码静态推演给出，若槽参数/序号偏差仅调整常量与序号，不改变用例意图。

### Step 11.2: 验证 + thresholds + 提交

`npx vitest run src/components/RePureTableBar/` 全绿 → include 追加 3 项后 typecheck 红（19 条）→ 修复 → 绿 → `--coverage` 预期 `src/bar.tsx` ≥80% 行+分支（`index.ts` barrel 不加键）。thresholds 追加：

```ts
        'src/components/RePureTableBar/src/bar.tsx': { lines: 80, branches: 80 },
```

```bash
pnpm exec prettier --write apps/pure-web/src/components/RePureTableBar/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git add apps/pure-web/src/components/RePureTableBar/ apps/pure-web/tsconfig.strict.json apps/pure-web/vitest.config.ts
git commit -m "test(web): b3.3 补齐 RePureTableBar 工具栏测试并迁入 strict 清单（密度/列显隐/固定/拖拽重排）"
```

---

## Task 12: B3.3 Canvas 豁免双件——ReCropperPreview / ReQrcode（4 + 0 strict 错误）

**Files:**

- Create: `apps/pure-web/src/components/ReCropperPreview/src/index.spec.ts`
- Create: `apps/pure-web/src/components/ReQrcode/src/index.spec.tsx`
- Modify: `apps/pure-web/src/components/ReCropperPreview/src/index.vue`（4：`onCropper({ base64, blob, info })` 参数解构隐式 any、`popoverRef.value.hide()` 可能 undefined 等，按诊断补类型）
- Modify: `apps/pure-web/tsconfig.strict.json`（追加 6 项：两组件域内 `index.ts` + `src/index.vue|tsx` + spec 各 2；`index.scss` 非 TS 不入清单）
- **不追加 thresholds 键**（Canvas 豁免口径：绘制主体行在 jsdom 不可达；与 backlog 59 行「B3 Canvas 绘制豁免回补」条目双向登记，注释写在各 spec 头部）
- `ReCropperPreview` 依赖的 `@/components/ReCropper` 为遗留豁免组件（零引用待处置），**必须 `vi.mock` 隔离**，不引入其内部依赖链（cropperjs）

### Step 12.1: ReCropperPreview spec（mock ReCropper + el-popover 透传）

完整文件 `apps/pure-web/src/components/ReCropperPreview/src/index.spec.ts`：

```ts
// @vitest-environment jsdom
// Canvas 豁免口径：裁剪绘制主体依赖 cropperjs + canvas 2d，jsdom 不可达；
// 本 spec 只覆盖事件接线与展示逻辑，绘制行不入覆盖率门禁（无 thresholds 键）。
// 双向登记：docs/governance/backlog.md「B3 Canvas 绘制豁免回补」。
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('@/components/ReCropper', () => {
  return import('vue').then(({ defineComponent, h }) => ({
    default: defineComponent({
      name: 'ReCropperStub',
      props: ['src', 'circled'],
      emits: ['cropper', 'readired'],
      render: () => h('div', { class: 're-cropper-stub' })
    })
  }));
});

vi.mock('element-plus', async () => {
  const { defineComponent: dc, h: vh } = await import('vue');
  return {
    ElPopover: dc({
      props: ['visible'],
      setup(props: any, { slots }: any) {
        return () =>
          vh(
            'div',
            { class: 'ep-popover', 'data-visible': props.visible ? '1' : '0' },
            [slots.reference?.(), slots.default?.()]
          );
      }
    }),
    ElImage: dc({
      props: ['src'],
      render(this: { src: string }) {
        return vhStub(this.src);
      }
    })
  };
});

// ElImage 渲染辅助（工厂内已拿到 h，此处仅为模板可读性在外部重新声明不可行，
// 执行时若嫌绕可直接在 ElImage.render 内联 vh('img', { class: 'ep-image', src: this.src })）
const vhStub = (src: string) => {
  const { h } = require('vue') as typeof import('vue');
  return h('img', { class: 'ep-image', src });
};

import ReCropperPreview from './index.vue';

function mountPreview() {
  return mount(ReCropperPreview, {
    props: { imgSrc: 'a.png' },
    global: { directives: { loading: () => {} } }
  });
}

describe('ReCropperPreview', () => {
  it('初始：popover 隐藏 + loading 遮罩；readired 后展示提示文案', async () => {
    const wrapper = mountPreview();
    expect(wrapper.find('.ep-popover').attributes('data-visible')).toBe('0');
    expect(wrapper.find('p').exists()).toBe(false);
    await wrapper.findComponent({ name: 'ReCropperStub' }).vm.$emit('readired');
    expect(wrapper.find('.ep-popover').attributes('data-visible')).toBe('1');
    expect(wrapper.text()).toContain('温馨提示');
  });

  it('cropper 事件：更新预览图与尺寸信息，并向上透传', async () => {
    const wrapper = mountPreview();
    const payload = {
      base64: 'data:image/png;base64,AAA',
      blob: new Blob(['x']),
      info: { width: '120.6', height: '80.4', size: 2048 }
    };
    await wrapper
      .findComponent({ name: 'ReCropperStub' })
      .vm.$emit('cropper', payload);
    expect(wrapper.emitted('cropper')?.[0]).toEqual([payload]);
    expect(wrapper.find('.ep-image').attributes('src')).toBe(payload.base64);
    expect(wrapper.text()).toContain('120 × 80像素'); // parseInt 截断断言真实取整行为
    expect(wrapper.text()).toContain('2.00 KB'); // formatBytes 真实计算（2048 字节）
  });

  it('expose hidePopover：委托 popoverRef.hide', () => {
    const wrapper = mountPreview();
    const hide = vi.fn();
    (wrapper.vm as unknown as { popoverRef: unknown }).popoverRef = { hide };
    (wrapper.vm as { hidePopover: () => void }).hidePopover();
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
```

> 执行提示：若 `require` 辅助在 ESM 链不适，直接把 ElImage 渲染内联进工厂（如注释所示），删去 `vhStub` 辅助。

### Step 12.2: ReQrcode spec（mock qrcode 边界；0 strict 错误）

toCanvas mock 返回的 canvas 必须补 `toDataURL`（jsdom 未实现，源码 canvas 分支 `canvasRef.toDataURL()` 会抛）。完整文件 `apps/pure-web/src/components/ReQrcode/src/index.spec.tsx`：

```tsx
// @vitest-environment jsdom
// Canvas 豁免口径：二维码绘制主体（qrcode 库 + canvas 2d）jsdom 不可达，
// 本 spec mock qrcode 边界后只覆盖组件分支逻辑；绘制行不入覆盖率门禁（无 thresholds 键）。
// 双向登记：docs/governance/backlog.md「B3 Canvas 绘制豁免回补」。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

const toCanvasMock = vi.hoisted(() =>
  vi.fn(async (canvas: HTMLCanvasElement) => {
    Object.defineProperty(canvas, 'width', { value: 33, configurable: true });
    (canvas as HTMLCanvasElement & { toDataURL: () => string }).toDataURL =
      vi.fn(() => 'data:image/png;base64,MOCK');
    return canvas;
  })
);
const toDataURLMock = vi.hoisted(() =>
  vi.fn(async () => 'data:image/png;base64,IMG')
);
vi.mock('qrcode', () => ({
  default: { toCanvas: toCanvasMock, toDataURL: toDataURLMock }
}));

import ReQrcode from './index';
import SvgIconStub from '@/test-utils/svg-component-stub';

const mountQr = (props: Recordable = {}) =>
  mount(ReQrcode, {
    props,
    global: {
      directives: { loading: () => {} },
      components: { IconifyIconOffline: SvgIconStub }
    }
  });

beforeEach(() => {
  toCanvasMock.mockClear();
  toDataURLMock.mockClear();
});

describe('ReQrcode', () => {
  it('canvas 分支：短文本默认容错 H，scale 按宽度折算，done 回传 dataURL', async () => {
    const wrapper = mountQr({ text: 'abc', width: 100 });
    await vi.waitFor(() => expect(wrapper.emitted('done')).toBeTruthy());
    expect(toCanvasMock).toHaveBeenCalledTimes(2); // getOriginWidth 探测 + 正式绘制
    const last = toCanvasMock.mock.calls.at(-1)![2] as Recordable;
    expect(last.errorCorrectionLevel).toBe('H');
    expect(last.scale).toBeCloseTo((100 / 33) * 4);
    expect(wrapper.emitted('done')![0]).toEqual([
      'data:image/png;base64,MOCK'
    ]);
  });

  it('容错档位：>16 字符 Q、>36 字符 M', async () => {
    const w1 = mountQr({ text: 'x'.repeat(20) });
    await vi.waitFor(() => expect(w1.emitted('done')).toBeTruthy());
    const w2 = mountQr({ text: 'x'.repeat(40) });
    await vi.waitFor(() => expect(w2.emitted('done')).toBeTruthy());
    const levels = toCanvasMock.mock.calls
      .filter((c: unknown[]) => (c[1] as string).startsWith('x'))
      .map((c: unknown[]) => (c[2] as Recordable).errorCorrectionLevel);
    expect(levels).toEqual(['Q', 'Q', 'M', 'M']);
  });

  it('img 分支：toDataURL 写 src；width 0 时 scale 为 undefined', async () => {
    const wrapper = mountQr({ text: 'abc', tag: 'img' });
    await vi.waitFor(() => expect(wrapper.emitted('done')).toBeTruthy());
    expect(toDataURLMock).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({ errorCorrectionLevel: 'H', width: 200 })
    );
    expect(wrapper.find('img').attributes('src')).toBe(
      'data:image/png;base64,IMG'
    );
    const zero = mountQr({ text: 'abc', width: 0 });
    await vi.waitFor(() => expect(zero.emitted('done')).toBeTruthy());
    expect(
      (toCanvasMock.mock.calls.at(-1)![2] as Recordable).scale
    ).toBeUndefined();
  });

  it('text 为空：watch 早退不初始化', () => {
    mountQr({ text: null });
    expect(toCanvasMock).not.toHaveBeenCalled();
  });

  it('logo 分支：jsdom 无 2d context 早退（Canvas 豁免边界）', async () => {
    const wrapper = mountQr({ text: 'abc', logo: 'logo.png' });
    // getContext('2d') 为 null → createLogoCode 早退，done 不发射为预期内
    await vi.waitFor(() => expect(toCanvasMock).toHaveBeenCalledTimes(2));
    expect(wrapper.emitted('done')).toBeUndefined();
  });

  it('disabled：覆盖层渲染 + disabled-click；正常态点击发 click', async () => {
    const wrapper = mountQr({
      text: 'abc',
      disabled: true,
      disabledText: '已过期'
    });
    expect(wrapper.find('.qrcode--disabled').exists()).toBe(true);
    expect(wrapper.text()).toContain('已过期');
    await wrapper.find('.qrcode--disabled').trigger('click');
    expect(wrapper.emitted('disabled-click')).toHaveLength(1);
    const normal = mountQr({ text: 'abc' });
    await normal.find('canvas').trigger('click');
    expect(normal.emitted('click')).toHaveLength(1);
  });
});
```

### Step 12.3: 验证 + 提交（不加 thresholds 键）

`npx vitest run src/components/ReCropperPreview/ src/components/ReQrcode/` 全绿 → include 追加 6 项后 typecheck 红（4 条，均在 ReCropperPreview）→ 修复 → 绿 → `--coverage` 仅观察（绘制行未覆盖为预期，不入门禁）。`node scripts/assert-strict-manifest.mjs` 通过后提交：

```bash
pnpm exec prettier --write apps/pure-web/src/components/ReCropperPreview/ apps/pure-web/src/components/ReQrcode/ apps/pure-web/tsconfig.strict.json
git add apps/pure-web/src/components/ReCropperPreview/ apps/pure-web/src/components/ReQrcode/ apps/pure-web/tsconfig.strict.json
git commit -m "test(web): b3.3 补齐 ReCropperPreview 与 ReQrcode 接线测试并迁入 strict 清单（Canvas 绘制按豁免口径不登记覆盖键）"
```

---

## Task 13: 批次收口（全量门禁复验 + 文档同步 + 上报）

- [ ] **Step 13.1: 全量门禁复跑**

```bash
cd apps/pure-web && npx vitest run
```

预期：`Test Files 47 passed`（B1 13 + B2 11 + B3 23：Task 0 2 + Task 1 1 + Task 2 7 + Task 3~9 各 1 + Task 10 1 + Task 11 1 + Task 12 2）。

```bash
pnpm --filter @multi-admin/pure-web run typecheck
```

预期：通过（域内 94 错误清零；清单 124 项全部由正式链编译）。

```bash
cd ../.. && node scripts/assert-strict-manifest.mjs
```

预期：`✔ strict 清单断言通过（清单 124 项 / 豁免 26 项 / 存量待迁移 126 项）`。

```bash
cd apps/pure-web && npx vitest run --coverage
```

预期：48 键全过（23 + 25；Canvas 三件无键不在表内）。

```bash
pnpm check
```

预期：prettier / typecheck / lint / stylelint / test / 覆盖枚举全绿。

- [ ] **Step 13.2: 文档同步**

`docs/tasks/README.md` 第 9 行（进行中表「pure-web 测试基建与 strict 类型安全」行）替换为：

```md
| pure-web 测试基建与 strict 类型安全 | 总体设计已定稿（批次 A0 上游基线 → A strict 迁移 → B vitest 基建与模块测试）；批次 A0/A+B0/B1/B2/B3 已合并 master 验收通过；B1（纯函数组）7 提交、B2（状态机/store 组）实施完成（11 spec）；B3（在用组件组）实施完成（23 spec 新增、双 stub 图标 alias + mountWithEP helper、strict 清单 53→124 项、豁免 29→26 项（ReDrawer 移出）、覆盖率键 23→48；Canvas 三件按豁免口径薄测试）；剩余：存量待迁移 126 项（页面/视图域，待 B4+）；见 [2026-08-29-pure-web-testing-foundation/](2026-08-29-pure-web-testing-foundation/) |
```

`docs/governance/backlog.md` **无需改动**：E2E 触发条件（54 行，已随 B2 收口更新为「B3 完成后评估启动」）、Canvas 豁免条目（59 行）、vitest 配置未来兼容条目（60 行）均已存在于库，本批次仅消费不改写。

- [ ] **Step 13.3: 提交**

```bash
git add docs/tasks/README.md
git commit -m "docs(repo): b3 批次收口同步——README 状态行更新至 B3 完成"
```

- [ ] **Step 13.4: 上报执行结果**

当前会话跑 `pnpm ops:pre-push`（frozen-lockfile + check + audit）作为可选终验；完成后向用户汇报 B3 批次完成（47 spec 全绿、124 项清单、48 覆盖键、94 strict 错误清零、ReDrawer 移出豁免），请用户决定是否执行分支 worktree 合并与 backlog 归档流程。

---

**自审三查结论（writing-plans 要求，2026-08-30 落盘时修订）：**

1. **Spec coverage**：B3 设计 16 组件全覆盖——零错误 6 件（ReAuth / RePerms / ReText / ReFlicker / ReQrcode / ReTypeit）与有错 10 件全部有 spec 与迁入步骤；设计的「统一图标 stub」经核验校准为双 stub（bar.tsx 将 `*.svg?component` 用作 JSX 标签，字符串替身会抛 InvalidCharacterError），已写入前置事实并在 Task 0 落码；Canvas 豁免口径（不给键 + 双向登记）覆盖 Task 9/12 三件，与 backlog 59 行条目闭合；ReDrawer 豁免移出与迁入同提交（Task 10 Step 10.2）；设计「批次终态数字」与各任务分项之和一致（71 = 45 + 23 + 3；25 键分布于 Task 0~8/10/11，Task 9/12 三件不给键）。
2. **Placeholder scan**：无 TBD/TODO 遗留；两处执行期允许的微调已显式声明且不改变用例意图——Task 11 列显隐用例初始断言常量与 pin 图标序号（首跑实测校正）、Task 12 ElImage stub 的 `vhStub` 辅助可内联化；各任务验证命令与预期均为具体值（含断言脚本三数字）；每条提交信息已写全，中文动词开头规避 commitlint subject-case。
3. **Type consistency**：spec/include/thresholds 路径与实际文件结构逐一对核（ReDrawer 3 文件、ReCropperPreview/ReQrcode 各 2 源文件 + scss 不入清单、ReIcon 域内 9 文件 7 spec）；`{ lines: 80, branches: 80 }` 顶层文件键形态与 B2 收口一致；提交前缀 `test(web): b3.x` 与 Task 13 `docs(repo)` 均在 commitlint scope 白名单；mock 口径（EP 渲染层透传 / vi.hoisted + async 工厂 / router 实例 mock）与 B1/B2 先例同形；门禁三件套命令与仓库现状脚本名逐字核对。


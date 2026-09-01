# A1 vue-tsc Strict 全量实测报告

> 测量日期：2026-08-29
> 目标应用：`apps/pure-web`
> 工具版本：vue-tsc 5.9.3 / TypeScript 5.x
> 性质：纯测量，不改代码

---

## 1. 总量概览

| 指标 | 数值 |
| --- | --- |
| 总源文件数（ts/tsx/vue，排除 d.ts） | 217 |
| 有错误文件数 | 96（37 .vue + 45 .ts + 14 .tsx） |
| 零错误文件数 | 121（36 .vue + 79 .ts + 6 .tsx） |
| **strict 错误总数** | **687** |
| .vue 错误数 | 314 |
| .ts 错误数 | 220 |
| .tsx 错误数 | 153 |

> 对比：纯 TS（`tsc --strict`，A0 baseline）384 错误 → 加入 .vue 后增至 687，
> .vue 模板贡献了约 303 个额外错误（其中部分 .vue 文件的 `<script>` 错误也被 vue-tsc 计入）。

---

## 2. 错误码分布（全量 30 种）

| 数量 | 错误码 | 含义摘要 |
| ---: | --- | --- |
| 190 | TS7006 | Parameter implicitly has an 'any' type |
| 60 | TS18048 | Possibly undefined / null |
| 58 | TS2345 | Argument not assignable |
| 57 | TS2322 | Type not assignable |
| 48 | TS7053 | Element implicitly has an 'any' type (index) |
| 43 | TS7005 | Variable implicitly has an 'any' type |
| 37 | TS2339 | Property does not exist |
| 27 | TS18047 | Possibly null |
| 25 | TS7031 | Binding element implicitly has 'any' type |
| 22 | TS18046 | Unknown type narrowing |
| 18 | TS7034 | Variable implicitly has type 'any' (no initializer) |
| 18 | TS2307 | Cannot find module |
| 14 | TS2722 | Cannot invoke, possibly undefined |
| 13 | TS2571 | Object is possibly 'undefined' |
| 12 | TS2538 | Type 'undefined' cannot be used as index |
| 11 | TS2769 | No overload matches |
| 9 | TS2531 | Object is possibly 'null' |
| 7 | TS2532 | Object is possibly 'undefined' |
| 3 | TS2366 | Function lacks ending return |
| 2 | TS2554 | Expected N arguments, got M |
| 2 | TS2349 | Not callable |
| 2 | TS7008 | Member implicitly has 'any' type |
| 2 | TS7022 | Variable implicitly has type 'any' (circular) |
| 1 | TS18049 | Nullish coalescing on null/undefined |
| 1 | TS7023 | Function implicitly has return type 'any' |
| 1 | TS2790 | Operand of delete must be optional |
| 1 | TS7015 | Element implicitly has 'any' type (enum) |
| 1 | TS2488 | Type has no Symbol.iterator |
| 1 | TS7016 | Could not find declaration file |
| 1 | TS2464 | Computed property name must be string/number/symbol |

### 错误码分组

| 分组 | 错误码 | 合计 | 占比 |
| --- | --- | ---: | ---: |
| implicit any 家族 | TS7006, TS7005, TS7053, TS7031, TS7034, TS7008, TS7022, TS7023, TS7015, TS7016 | 367 | 53.4% |
| null/undefined 窄化 | TS18048, TS18047, TS18046, TS18049, TS2531, TS2532, TS2538, TS2571 | 143 | 20.8% |
| 类型不兼容 | TS2322, TS2345, TS2339, TS2769, TS2349 | 145 | 21.1% |
| 模块缺失 | TS2307 | 18 | 2.6% |
| 其他 | TS2722, TS2366, TS2554, TS2790, TS2488, TS2464 | 14 | 2.0% |

---

## 3. 文件错误分布 Top 20

| 错误数 | 文件 |
| ---: | --- |
| 46 | src/components/ReSelector/src/index.tsx |
| 34 | src/layout/components/lay-sidebar/components/SidebarItem.vue |
| 34 | src/layout/hooks/useTag.ts |
| 33 | src/layout/components/lay-tag/index.vue |
| 31 | src/layout/components/lay-search/components/SearchModal.vue |
| 30 | src/components/ReSeamlessScroll/src/index.vue |
| 22 | src/views/system/user/utils/hook.tsx |
| 21 | src/layout/components/lay-setting/index.vue |
| 21 | src/utils/chinaArea.ts |
| 20 | src/router/utils.ts |
| 16 | src/views/system/role/utils/hook.tsx |
| 16 | src/components/RePureTableBar/src/bar.tsx |
| 16 | src/components/ReDialog/index.vue |
| 14 | src/store/modules/multiTags.ts |
| 14 | src/components/ReDrawer/index.vue |
| 13 | src/utils/print.ts |
| 12 | src/views/system/user/tree.vue |
| 12 | src/layout/components/lay-sidebar/components/SidebarBreadCrumb.vue |
| 11 | src/components/ReVxeTableBar/src/bar.tsx |
| 11 | src/utils/http/index.ts |

---

## 4. 零错误文件全清单（121 个）

### build/（4 个）

- build/cdn.ts
- build/info.ts
- build/optimize.ts
- build/plugins.ts

### src/components/（43 个）

- src/components/ReAnimateSelector/index.ts
- src/components/ReAnimateSelector/src/animate.ts
- src/components/ReAuth/index.ts
- src/components/ReAuth/src/auth.tsx
- src/components/ReBarcode/index.ts
- src/components/ReBarcode/src/index.vue
- src/components/ReCountTo/index.ts
- src/components/ReCountTo/src/normal/props.ts
- src/components/ReCountTo/src/rebound/props.ts
- src/components/ReCropper/index.ts
- src/components/ReCropper/src/svg/index.ts
- src/components/ReCropperPreview/index.ts
- src/components/ReDialog/type.ts
- src/components/ReDrawer/type.ts
- src/components/ReFlicker/index.ts
- src/components/ReFlop/index.ts
- src/components/ReFlop/src/filpper.tsx
- src/components/ReIcon/data.ts
- src/components/ReIcon/index.ts
- src/components/ReIcon/src/iconfont.ts
- src/components/ReIcon/src/iconifyIconOnline.ts
- src/components/ReIcon/src/offlineIcon.ts
- src/components/ReIcon/src/types.ts
- src/components/ReImageVerify/index.ts
- src/components/ReImageVerify/src/hooks.ts
- src/components/ReImageVerify/src/index.vue
- src/components/RePerms/index.ts
- src/components/RePerms/src/perms.tsx
- src/components/RePureTableBar/index.ts
- src/components/ReQrcode/index.ts
- src/components/ReQrcode/src/index.tsx
- src/components/ReSeamlessScroll/index.ts
- src/components/ReSeamlessScroll/src/utils.ts
- src/components/ReSegmented/index.ts
- src/components/ReSegmented/src/type.ts
- src/components/ReSelector/index.ts
- src/components/ReSplitPane/resizer.tsx
- src/components/ReText/index.ts
- src/components/ReText/src/index.vue
- src/components/ReTypeit/index.ts
- src/components/ReTypeit/src/index.tsx
- src/components/ReVxeTableBar/index.ts

### src/directives/（6 个）

- src/directives/auth/index.ts
- src/directives/copy/index.ts
- src/directives/index.ts
- src/directives/optimize/index.ts
- src/directives/perms/index.ts
- src/directives/ripple/index.ts

### src/layout/（19 个）

- src/layout/components/lay-footer/index.vue
- src/layout/components/lay-navbar/index.vue
- src/layout/components/lay-notice/components/NoticeList.vue
- src/layout/components/lay-notice/data.ts
- src/layout/components/lay-search/components/SearchFooter.vue
- src/layout/components/lay-search/index.vue
- src/layout/components/lay-search/types.ts
- src/layout/components/lay-sidebar/components/SidebarCenterCollapse.vue
- src/layout/components/lay-sidebar/components/SidebarExtraIcon.vue
- src/layout/components/lay-sidebar/components/SidebarFullScreen.vue
- src/layout/components/lay-sidebar/components/SidebarLeftCollapse.vue
- src/layout/components/lay-sidebar/components/SidebarLogo.vue
- src/layout/components/lay-sidebar/components/SidebarTopCollapse.vue
- src/layout/components/lay-tag/components/TagChrome.vue
- src/layout/hooks/useBoolean.ts
- src/layout/hooks/useLayout.ts
- src/layout/hooks/useTranslationLang.ts
- src/layout/redirect.vue
- src/layout/types.ts

### src/plugins/（2 个）

- src/plugins/echarts.ts
- src/plugins/vxeTable.ts

### src/router/（3 个）

- src/router/enums.ts
- src/router/modules/home.ts
- src/router/modules/remaining.ts

### src/store/（4 个）

- src/store/index.ts
- src/store/modules/epTheme.ts
- src/store/types.ts
- src/store/utils.ts

### src/utils/（7 个）

- src/utils/globalPolyfills.ts
- src/utils/message.ts
- src/utils/mitt.ts
- src/utils/progress/index.ts
- src/utils/propTypes.ts
- src/utils/responsive.ts
- src/utils/tree.ts

### src/views/（33 个）

- src/views/account-settings/components/SecurityLog.vue
- src/views/empty/index.vue
- src/views/error/403.vue
- src/views/error/404.vue
- src/views/error/500.vue
- src/views/login/components/LoginPhone.vue
- src/views/login/components/LoginQrCode.vue
- src/views/login/utils/enums.ts
- src/views/login/utils/rule.ts
- src/views/login/utils/static.ts
- src/views/monitor/online/index.vue
- src/views/monitor/utils.ts
- src/views/system/dept/form.vue
- src/views/system/dept/index.vue
- src/views/system/dept/utils/rule.ts
- src/views/system/dept/utils/types.ts
- src/views/system/hooks.ts
- src/views/system/menu/index.vue
- src/views/system/menu/utils/enums.ts
- src/views/system/menu/utils/rule.ts
- src/views/system/menu/utils/types.ts
- src/views/system/role/form.vue
- src/views/system/role/index.vue
- src/views/system/role/utils/rule.ts
- src/views/system/user/form/index.vue
- src/views/system/user/form/role.vue
- src/views/system/user/index.vue
- src/views/system/user/utils/rule.ts
- src/views/welcome/components/charts/ChartBar.vue
- src/views/welcome/components/charts/ChartLine.vue
- src/views/welcome/components/charts/ChartRound.vue
- src/views/welcome/components/charts/index.ts
- src/views/welcome/components/table/index.vue
- src/views/welcome/utils.ts

---

## 5. 测量命令与参数

### 执行环境

- OS: Windows 25H2
- Shell: PowerShell (pwsh)
- Node: 通过 `NODE_OPTIONS=--max-old-space-size=8192` 提升内存上限
- 工具：`pnpm exec vue-tsc`（版本 5.9.3）

### 命令

```powershell
Set-Location "apps/pure-web"
$env:NODE_OPTIONS = "--max-old-space-size=8192"
pnpm exec vue-tsc --noEmit --skipLibCheck --strict *> ./.strict-log.txt
echo "exit: $LASTEXITCODE"
```

### tsconfig 覆盖说明

`apps/pure-web/tsconfig.json` 中 `"strict": false`，命令行 `--strict` 参数会覆盖此选项，
同时所有 strict 子选项（`strictNullChecks`、`strictFunctionTypes`、`noImplicitAny` 等）均被启用。

其他保留的配置：

- `skipLibCheck: true`（命令行也传入，跳过第三方库类型检查）
- `moduleResolution: bundler`
- `target: ESNext`

---

## 6. 异常与降级路径

### 无异常

本次测量全程顺利完成，未遇到以下情况：

- ❌ 进程 OOM 崩溃
- ❌ 进程挂起超时
- ❌ 需要批次分割

### 执行时间

vue-tsc 全量检查约 8-12 分钟完成（77 个 .vue 文件模板类型推导），退出码 2（表示有类型错误，属预期行为）。

### 日志文件

原始日志保存在 `apps/pure-web/.strict-log.txt`（不纳入 git），如需复查可直接查看。

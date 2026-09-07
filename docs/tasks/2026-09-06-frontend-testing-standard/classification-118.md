# 118 未登记文件六层分类清单（Phase 1a 产出）

> 209 include = 91 已登记 + 118 未登记；122 spec 文件。判定结论基于计划编写期源码通读，执行时若源码与结论不符按 Task 10 Step 10.4 复核规则修正。

## A 类——已测未登记（有 spec，coverage 达标即补键；不达标先补用例）（29 个）

src/layout/components/lay-search/components/SearchResult.vue
src/layout/components/lay-setting/index.vue
src/layout/components/lay-sidebar/components/SidebarBreadCrumb.vue
src/layout/components/lay-sidebar/components/SidebarExtraIcon.vue
src/layout/components/lay-sidebar/components/SidebarItem.vue
src/layout/components/lay-sidebar/components/SidebarLinkItem.vue
src/layout/components/lay-sidebar/components/SidebarLogo.vue
src/layout/components/lay-tag/index.vue
src/views/login/utils/static.ts
src/views/system/hooks.ts
src/views/system/dept/form.vue
src/views/system/dept/index.vue
src/views/system/dept/utils/hook.tsx
src/views/system/dept/utils/rule.ts
src/views/system/menu/form.vue
src/views/system/menu/index.vue
src/views/system/menu/utils/enums.ts
src/views/system/menu/utils/hook.tsx
src/views/system/menu/utils/rule.ts
src/views/system/role/form.vue
src/views/system/role/index.vue
src/views/system/role/utils/hook.tsx
src/views/system/role/utils/rule.ts
src/views/system/user/form/index.vue
src/views/system/user/form/role.vue
src/views/system/user/index.vue
src/views/system/user/tree.vue
src/views/system/user/utils/hook.tsx
src/views/system/user/utils/rule.ts

## B 类——T1/T2 真缺口（无 spec，须 characterization 补测）（39 个）

### Task 10 域1 layout（22）

| 文件 | 层级 | 说明 |
|------|------|------|
| src/layout/hooks/useBoolean.ts | T1 | 纯逻辑 |
| src/layout/hooks/useLayout.ts | T1 | 纯逻辑（依赖 store/storage） |
| src/layout/hooks/useTranslationLang.ts | T1 | 纯逻辑（依赖 useNav/i18n） |
| src/layout/index.vue | T3 | 壳 |
| src/layout/frame.vue | T3 | 壳（iframe 载体） |
| src/layout/components/lay-content/index.vue | T3 | 壳 |
| src/layout/components/lay-frame/index.vue | T3 | 壳 |
| src/layout/components/lay-navbar/index.vue | T3 | 壳（逻辑全下沉 useNav/useTranslationLang） |
| src/layout/components/lay-notice/index.vue | T2 | onMarkAsRead 状态流 + computed 分支 |
| src/layout/components/lay-notice/components/NoticeItem.vue | T3 | 壳（DOM 测量 tooltip 渐进增强） |
| src/layout/components/lay-panel/index.vue | T2 | emitter 开合状态 + onClickOutside |
| src/layout/components/lay-search/index.vue | T3 | 壳（一行 toggle） |
| src/layout/components/lay-search/components/SearchFooter.vue | T3 | 壳（静态提示条） |
| src/layout/components/lay-search/components/SearchHistory.vue | T2 | active 高亮/事件转发状态流 |
| src/layout/components/lay-search/components/SearchModal.vue | T2 | 核心交互 |
| src/layout/components/lay-sidebar/NavHorizontal.vue | T2 | showLogo + emitter + defaultActive |
| src/layout/components/lay-sidebar/NavMix.vue | T2 | getDefaultActive 分支 + watch |
| src/layout/components/lay-sidebar/NavVertical.vue | T2 | getSubMenuData 早退分支 |
| src/layout/components/lay-sidebar/components/SidebarCenterCollapse.vue | T3 | 壳（纯样式） |
| src/layout/components/lay-sidebar/components/SidebarFullScreen.vue | T3 | 壳 |
| src/layout/components/lay-sidebar/components/SidebarLeftCollapse.vue | T3 | 壳 |
| src/layout/components/lay-sidebar/components/SidebarTopCollapse.vue | T3 | 壳 |

### Task 11 域3 login + welcome（7）

| 文件 | 层级 | 说明 |
|------|------|------|
| src/views/login/index.vue | T3 | 壳（校验逻辑在 utils/ 已登记） |
| src/views/login/components/LoginPhone.vue | T2 | validate 分支 + loading 状态流 |
| src/views/login/components/LoginQrCode.vue | T3 | 壳（canvas 由 T4 排除的 ReQrcode 承载） |
| src/views/login/components/LoginRegist.vue | T2 | repeatPasswordRule 三分支 |
| src/views/login/components/LoginUpdate.vue | T2 | repeatPasswordRule 三分支 |
| src/views/welcome/index.vue | T3 | 壳 |
| src/views/welcome/components/table/index.vue | T3 | 壳（逻辑在 columns.tsx） |

### Task 12 域4 account-settings + monitor（10）

| 文件 | 层级 | 说明 |
|------|------|------|
| src/views/account-settings/index.vue | T3 | 壳 |
| src/views/account-settings/components/AccountManagement.vue | T3 | 壳 |
| src/views/account-settings/components/Preferences.vue | T3 | 壳 |
| src/views/account-settings/components/Profile.vue | T2 | getMine 填充/头像上传/提交分支 |
| src/views/account-settings/components/SecurityLog.vue | T2 | onSearch code 分支 + 404 catch |
| src/views/monitor/logs/login/index.vue | T3 | 壳 |
| src/views/monitor/logs/operation/index.vue | T3 | 壳 |
| src/views/monitor/logs/system/index.vue | T3 | 壳 |
| src/views/monitor/logs/system/detail.vue | T3 | 壳 |
| src/views/monitor/online/index.vue | T3 | 壳（无 echarts，纯表格） |

## T4——jsdom 受限（exclude + 豁免双向登记 + E2E 回补）（10 个）

| 文件 | 薄测试 | 理由 |
|------|--------|------|
| src/utils/print.ts | print.spec.ts 存在 | DOM 打印不可达 |
| src/components/ReCropper/src/index.tsx | index.spec.tsx 存在 | cropper 深交互 |
| src/components/ReCropperPreview/src/index.vue | index.spec.ts 存在 | canvas 预览 |
| src/components/ReImageVerify/src/index.vue | index.spec.ts 存在 | canvas 验证码 |
| src/components/ReImageVerify/src/hooks.ts | 同上覆盖 | 同上 |
| src/components/ReQrcode/src/index.tsx | index.spec.tsx 存在 | canvas 二维码 |
| src/views/welcome/components/charts/ChartBar.vue | 无（纯渲染） | echarts 渲染 |
| src/views/welcome/components/charts/ChartLine.vue | 无（纯渲染） | echarts 渲染 |
| src/views/welcome/components/charts/ChartRound.vue | 无（纯渲染） | echarts 渲染 |

> NOTE: `src/views/monitor/online/index.vue` 已判 T3（无 echarts，纯表格组合），不在 T4 表中重复登记。

## T5——无逻辑（exclude + 理由）（36+4 待验证 type.ts）

### 入口/根壳
- src/App.vue（根壳）
- src/main.ts（入口 bootstrap）

### barrel（纯 re-export）
- src/directives/index.ts
- src/components/ReAnimateSelector/index.ts
- src/components/ReAuth/index.ts
- src/components/ReCountTo/index.ts
- src/components/ReCropper/index.ts
- src/components/ReCropper/src/svg/index.ts（svg 导入）
- src/components/ReCropperPreview/index.ts
- src/components/ReIcon/index.ts
- src/components/ReImageVerify/index.ts
- src/components/RePerms/index.ts
- src/components/RePureTableBar/index.ts
- src/components/ReQrcode/index.ts
- src/components/ReSegmented/index.ts
- src/components/ReText/index.ts
- src/components/ReTypeit/index.ts
- src/views/welcome/components/charts/index.ts

### plugin 注册
- src/plugins/echarts.ts
- src/plugins/elementPlus.ts
- src/plugins/i18n.ts
- src/plugins/vxeTable.ts

### 静态配置
- src/config/index.ts（纯配置对象）
- src/router/modules/home.ts（静态路由配置）
- src/router/modules/remaining.ts（静态路由配置）

### 纯类型
- src/store/types.ts
- src/layout/types.ts
- src/layout/components/lay-search/types.ts

### 静态页
- src/views/empty/index.vue
- src/views/error/403.vue
- src/views/error/404.vue
- src/views/error/500.vue

### 待验证 type.ts（判 T5 若纯类型；含运行时则归 T1）
- src/components/ReDialog/type.ts
- src/components/ReDrawer/type.ts
- src/components/ReSegmented/src/type.ts
- src/components/ReIcon/src/types.ts

## 另列

- src/router/index.ts 单独处置（Task 9 拆分，不计入上表）

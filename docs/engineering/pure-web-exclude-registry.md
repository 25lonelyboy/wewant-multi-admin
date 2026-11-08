---
status: living
covers:
  - apps/pure-web/vitest.config.ts
last_verified: 2026-11-08
---

# pure-web coverage exclude 豁免注册表

覆盖率 exclude 的逐条登记处：渲染受限与页面壳逐条登记，无逻辑类按分组登记。六层判定框架见 [frontend-testing-standard.md](frontend-testing-standard.md)；`vitest.config.ts` 内的内联理由与本文同源，改动需两处同步。

治理铁律：每条 exclude 必须映射页面壳 / 渲染受限 / 无逻辑 + 理由，禁止「测不到就排除」。

## 全局排除

| 文件 | 理由 |
| --- | --- |
| `**/*.d.ts` | 类型声明，无运行期逻辑 |
| `**/*.spec.ts` | 测试文件自身，不计入被测算代码 |

## 渲染受限（豁免双向登记：薄测试 + E2E 回补 + 本表登记，三者缺一视为技术债）

| 文件 | 薄测试 | E2E 回补 | 理由 |
| --- | --- | --- | --- |
| src/utils/print.ts | print.spec.ts | verify.spec「Print 工具模块可加载」 | DOM 打印不可达 |
| src/components/ReImageVerify/** | index.spec.ts | verify.spec「验证码 canvas 渲染+刷新」 | canvas 验证码 |
| src/components/ReCropper/** | index.spec.tsx | components.spec（cropper 深度交互永久豁免） | cropper 深交互 |
| src/components/ReCropperPreview/** | index.spec.ts | components.spec「用户管理页可达渲染」 | canvas 预览 |
| src/components/ReQrcode/** | index.spec.tsx | components.spec「二维码 canvas 非空」 | canvas 二维码 |
| src/views/welcome/components/charts/*.vue | 无（纯渲染） | 登录后 welcome 页可达 | echarts 渲染 |

## 无逻辑（入口 / barrel / 配置 / 纯类型 / 静态页）

| 文件 | 分组 | 理由 |
| --- | --- | --- |
| src/main.ts | 入口 / 根壳 | bootstrap 入口 |
| src/App.vue | 入口 / 根壳 | 根壳 |
| src/directives/index.ts | barrel | 纯 re-export |
| src/components/ReAnimateSelector/index.ts | barrel | 纯 re-export |
| src/components/ReAuth/index.ts | barrel | 纯 re-export |
| src/components/ReCountTo/index.ts | barrel | 纯 re-export |
| src/components/ReCropper/index.ts | barrel | 纯 re-export |
| src/components/ReCropper/src/svg/index.ts | barrel | 纯 re-export |
| src/components/ReCropperPreview/index.ts | barrel | 纯 re-export |
| src/components/ReIcon/index.ts | barrel | 纯 re-export |
| src/components/ReImageVerify/index.ts | barrel | 纯 re-export |
| src/components/RePerms/index.ts | barrel | 纯 re-export |
| src/components/RePureTableBar/index.ts | barrel | 纯 re-export |
| src/components/ReQrcode/index.ts | barrel | 纯 re-export |
| src/components/ReSegmented/index.ts | barrel | 纯 re-export |
| src/components/ReText/index.ts | barrel | 纯 re-export |
| src/components/ReTypeit/index.ts | barrel | 纯 re-export |
| src/views/welcome/components/charts/index.ts | barrel | 纯 re-export |
| src/plugins/*.ts | plugin / 配置 | app.use 副作用注册 |
| src/config/index.ts | plugin / 配置 | 纯配置对象 |
| src/router/modules/*.ts | plugin / 配置 | 静态路由配置 |
| src/views/empty/index.vue | 静态页 | 无业务逻辑 |
| src/views/error/*.vue | 静态页 | 无业务逻辑 |
| src/store/types.ts | 纯类型 | 无运行期逻辑 |
| src/layout/types.ts | 纯类型 | 无运行期逻辑 |
| src/layout/components/lay-search/types.ts | 纯类型 | 无运行期逻辑 |
| src/views/system/dept/utils/types.ts | 纯类型 | 无运行期逻辑 |
| src/views/system/menu/utils/types.ts | 纯类型 | 无运行期逻辑 |
| src/views/system/role/utils/types.ts | 纯类型 | 无运行期逻辑 |
| src/views/system/user/utils/types.ts | 纯类型 | 无运行期逻辑 |
| src/components/ReDialog/type.ts | 纯类型 | 无运行期逻辑 |
| src/components/ReDrawer/type.ts | 纯类型 | 无运行期逻辑 |
| src/components/ReSegmented/src/type.ts | 纯类型 | 无运行期逻辑 |
| src/components/ReIcon/src/types.ts | 纯类型 | 无运行期逻辑 |

## 页面壳（smoke 已覆盖 + coverage exclude）

| 文件 | 薄测试 | 理由 |
| --- | --- | --- |
| src/layout/index.vue | index.spec.ts | 布局壳：组合子组件，无独立逻辑 |
| src/layout/frame.vue | frame.spec.ts | iframe 载体：仅渲染 iframe |
| src/layout/components/lay-content/index.vue | index.spec.ts | 内容区壳：router-view 包装 |
| src/layout/components/lay-frame/index.vue | index.spec.ts | frame 壳：多 iframe 缓存包装 |
| src/layout/components/lay-navbar/index.vue | index.spec.ts | 导航壳：组合面包屑+工具栏 |
| src/layout/components/lay-notice/components/NoticeItem.vue | NoticeItem.spec.ts | 通知项壳：展示型组件 |
| src/layout/components/lay-search/index.vue | index.spec.ts | 搜索入口壳：触发 toggle |
| src/layout/components/lay-search/components/SearchFooter.vue | SearchFooter.spec.ts | 搜索底栏壳：快捷键提示 |
| src/layout/components/lay-sidebar/components/SidebarFullScreen.vue | SidebarFullScreen.spec.ts | 全屏按钮壳：toggle 代理 |
| src/layout/components/lay-sidebar/components/SidebarCenterCollapse.vue | SidebarCenterCollapse.spec.ts | 折叠按钮壳：emit toggleClick |
| src/layout/components/lay-sidebar/components/SidebarLeftCollapse.vue | SidebarLeftCollapse.spec.ts | 左折叠壳：emit toggleClick |
| src/layout/components/lay-sidebar/components/SidebarTopCollapse.vue | SidebarTopCollapse.spec.ts | 顶折叠壳：emit toggleClick |
| src/views/login/index.vue | index.spec.ts | 登录壳：组合子组件，无独立逻辑 |
| src/views/login/components/LoginQrCode.vue | LoginQrCode.spec.ts | 二维码壳：展示 ReQrcode + 返回按钮 |
| src/views/welcome/index.vue | index.spec.ts | 欢迎页壳：组合图表/卡片/表格 |
| src/views/welcome/components/table/index.vue | index.spec.ts | 表格壳：pure-table 包装 |
| src/views/account-settings/index.vue | index.spec.ts | 账户设置壳：组合子组件，无独立逻辑 |
| src/views/account-settings/components/AccountManagement.vue | AccountManagement.spec.ts | 账户管理壳：静态列表展示 |
| src/views/account-settings/components/Preferences.vue | Preferences.spec.ts | 偏好设置壳：开关列表展示 |
| src/views/monitor/logs/login/index.vue | index.spec.ts | 登录日志壳：组合 hook + 表格 |
| src/views/monitor/logs/operation/index.vue | index.spec.ts | 操作日志壳：组合 hook + 表格 |
| src/views/monitor/logs/system/index.vue | index.spec.ts | 系统日志壳：组合 hook + 表格 |
| src/views/monitor/logs/system/detail.vue | detail.spec.ts | 日志详情壳：JSON 展示 |
| src/views/monitor/online/index.vue | index.spec.ts | 在线用户壳：组合 hook + 表格 |

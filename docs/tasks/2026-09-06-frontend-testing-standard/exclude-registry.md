# pure-web coverage exclude 豁免主表（Phase 1b 起；living 提升后迁 frontend-testing-standard.md）

治理铁律：每条 exclude 必须映射 T3/T4/T5 + 理由，禁止「测不到就排除」。

## T4 jsdom 受限（豁免双向登记：薄测试 + E2E 回补 + 本表登记，三者缺一视为技术债）

| 文件 | 薄测试 | E2E 回补 | 理由 |
| --- | --- | --- | --- |
| src/utils/print.ts | print.spec.ts | verify.spec「Print 工具模块可加载」 | DOM 打印不可达 |
| src/components/ReImageVerify/** | index.spec.ts | verify.spec「验证码 canvas 渲染+刷新」 | canvas 验证码 |
| src/components/ReCropper/** | index.spec.tsx | components.spec（cropper 深度交互永久豁免） | cropper 深交互 |
| src/components/ReCropperPreview/** | index.spec.ts | components.spec「用户管理页可达渲染」 | canvas 预览 |
| src/components/ReQrcode/** | index.spec.tsx | components.spec「二维码 canvas 非空」 | canvas 二维码 |
| src/views/welcome/components/charts/*.vue | 无（纯渲染） | 登录后 welcome 页可达 | echarts 渲染 |

## T5 无逻辑

（barrel/plugins/入口/静态页/纯类型——逐条理由见 vitest.config.ts 内联注释，双处同源）

## T3 页面壳（smoke 已覆盖 + coverage exclude）

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

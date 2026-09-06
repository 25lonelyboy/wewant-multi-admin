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

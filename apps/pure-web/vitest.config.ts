import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { alias, __APP_INFO__ } from './build/utils.js';

const svgRawStub = fileURLToPath(
  new URL('./src/test-utils/svg-raw-stub.ts', import.meta.url)
);
const svgComponentStub = fileURLToPath(
  new URL('./src/test-utils/svg-component-stub.ts', import.meta.url)
);
const vueJsxSsrHelperStub = fileURLToPath(
  new URL('./src/test-utils/vue-jsx-ssr-helper-stub.ts', import.meta.url)
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
      // `*.svg?component` 由下方 svgComponentPlugin 插件处理
      // @vitejs/plugin-vue-jsx v5 在 vitest node 环境下注入的 SSR 虚拟模块
      {
        find: '/__vue-jsx-ssr-register-helper',
        replacement: vueJsxSsrHelperStub
      },
      ...Object.entries(alias).map(([find, replacement]) => ({
        find,
        replacement
      }))
    ]
  },
  plugins: [
    // `*.svg?component`（vite-svg-loader 为构建期插件，测试链不加载）
    // 使用插件而非 alias：Vite 在 alias 解析前剥离 query string，导致正则无法匹配 ?component
    {
      name: 'svg-component-stub',
      enforce: 'pre' as const,
      resolveId(id) {
        if (id.endsWith('.svg?component')) {
          // 必须用 file URL 或正斜杠路径；Windows 反斜杠会导致模块加载失败
          return pathToFileURL(svgComponentStub).href;
        }
      }
    },
    vue(),
    vueJsx()
  ],
  define: {
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_INFO__: JSON.stringify(__APP_INFO__)
  },
  test: {
    env: { VITE_ROUTER_HISTORY: 'hash' },
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}', 'build/*.spec.ts', 'mock/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx,vue}', 'build/*.ts', 'mock/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.spec.ts',
        // ── T5 无逻辑：入口 / 根壳 ──
        'src/main.ts', // T5: bootstrap 入口
        'src/App.vue', // T5: 根壳
        // ── T5 无逻辑：barrel ──
        'src/directives/index.ts', // T5: barrel
        'src/components/ReAnimateSelector/index.ts', // T5: barrel
        'src/components/ReAuth/index.ts', // T5: barrel
        'src/components/ReCountTo/index.ts', // T5: barrel
        'src/components/ReCropper/index.ts', // T5: barrel
        'src/components/ReCropper/src/svg/index.ts', // T5: barrel
        'src/components/ReCropperPreview/index.ts', // T5: barrel
        'src/components/ReIcon/index.ts', // T5: barrel
        'src/components/ReImageVerify/index.ts', // T5: barrel
        'src/components/RePerms/index.ts', // T5: barrel
        'src/components/RePureTableBar/index.ts', // T5: barrel
        'src/components/ReQrcode/index.ts', // T5: barrel
        'src/components/ReSegmented/index.ts', // T5: barrel
        'src/components/ReText/index.ts', // T5: barrel
        'src/components/ReTypeit/index.ts', // T5: barrel
        'src/views/welcome/components/charts/index.ts', // T5: barrel
        // ── T5 无逻辑：plugin / 配置 / 类型 / 静态页 ──
        'src/plugins/*.ts', // T5: app.use 副作用注册
        'src/config/index.ts', // T5: 纯配置对象
        'src/router/modules/*.ts', // T5: 静态路由配置
        'src/store/types.ts', // T5: 纯类型
        'src/layout/types.ts', // T5: 纯类型
        'src/layout/components/lay-search/types.ts', // T5: 纯类型
        'src/views/empty/index.vue', // T5: 静态页
        'src/views/error/*.vue', // T5: 静态页
        // ── T4 jsdom 受限 ──
        'src/utils/print.ts', // T4: DOM 打印不可达
        'src/components/ReImageVerify/**', // T4: canvas 验证码
        'src/components/ReCropper/**', // T4: cropper 深交互
        'src/components/ReCropperPreview/**', // T4: canvas 预览
        'src/components/ReQrcode/**', // T4: canvas 二维码
        'src/views/welcome/components/charts/*.vue', // T4: echarts 渲染
        // ── T5 纯类型：views/system ──
        'src/views/system/dept/utils/types.ts', // T5: 纯类型
        'src/views/system/menu/utils/types.ts', // T5: 纯类型
        'src/views/system/role/utils/types.ts', // T5: 纯类型
        'src/views/system/user/utils/types.ts', // T5: 纯类型
        // ── T5 纯类型：components type.ts ──
        'src/components/ReDialog/type.ts', // T5: 纯类型
        'src/components/ReDrawer/type.ts', // T5: 纯类型
        'src/components/ReSegmented/src/type.ts', // T5: 纯类型
        'src/components/ReIcon/src/types.ts', // T5: 纯类型
        // ── T3 页面壳：Task 10-12 逐域追加 ──
        // ── T3 页面壳（smoke 已覆盖）──
        'src/layout/index.vue', // T3: 布局壳
        'src/layout/frame.vue', // T3: iframe 载体
        'src/layout/components/lay-content/index.vue', // T3: 内容区壳
        'src/layout/components/lay-frame/index.vue', // T3: frame 壳
        'src/layout/components/lay-navbar/index.vue', // T3: 导航壳
        'src/layout/components/lay-notice/components/NoticeItem.vue', // T3: 通知项壳
        'src/layout/components/lay-search/index.vue', // T3: 搜索入口壳
        'src/layout/components/lay-search/components/SearchFooter.vue', // T3: 搜索底栏壳
        'src/layout/components/lay-sidebar/components/SidebarFullScreen.vue', // T3: 全屏按钮壳
        'src/layout/components/lay-sidebar/components/SidebarCenterCollapse.vue', // T3: 折叠按钮壳
        'src/layout/components/lay-sidebar/components/SidebarLeftCollapse.vue', // T3: 左折叠壳
        'src/layout/components/lay-sidebar/components/SidebarTopCollapse.vue', // T3: 顶折叠壳
        'src/views/login/index.vue', // T3: 登录壳
        'src/views/login/components/LoginQrCode.vue', // T3: 二维码壳
        'src/views/welcome/index.vue', // T3: 欢迎页壳
        'src/views/welcome/components/table/index.vue', // T3: 表格壳
        'src/views/account-settings/index.vue', // T3: 账户设置壳
        'src/views/account-settings/components/AccountManagement.vue', // T3: 账户管理壳
        'src/views/account-settings/components/Preferences.vue', // T3: 偏好设置壳
        'src/views/monitor/logs/login/index.vue', // T3: 登录日志壳
        'src/views/monitor/logs/operation/index.vue', // T3: 操作日志壳
        'src/views/monitor/logs/system/index.vue', // T3: 系统日志壳
        'src/views/monitor/logs/system/detail.vue', // T3: 日志详情壳
        'src/views/monitor/online/index.vue' // T3: 在线用户壳
      ],
      thresholds: {
        'build/utils.ts': { lines: 80, branches: 80 },
        'build/cdn.ts': { lines: 80, branches: 80 },
        'build/compress.ts': { lines: 80, branches: 80 },
        'build/info.ts': { lines: 80, branches: 80 },
        'build/optimize.ts': { lines: 80, branches: 80 },
        'build/plugins.ts': { lines: 80, branches: 80 },
        'mock/asyncRoutes.ts': { lines: 80, branches: 80 },
        'mock/login.ts': { lines: 80, branches: 80 },
        'mock/mine.ts': { lines: 80, branches: 80 },
        'mock/refreshToken.ts': { lines: 80, branches: 80 },
        'mock/system.ts': { lines: 80, branches: 80 },
        'src/api/mock.ts': { lines: 80, branches: 80 },
        'src/api/routes.ts': { lines: 80, branches: 80 },
        'src/api/system.ts': { lines: 80, branches: 80 },
        'src/api/user.ts': { lines: 80, branches: 80 },
        'src/router/enums.ts': { lines: 80, branches: 80 },
        'src/utils/tree.ts': { lines: 80, branches: 80 },
        'src/router/utils.ts': { lines: 80, branches: 80 },
        'src/router/guards.ts': { lines: 80, branches: 80 },
        'src/utils/auth.ts': { lines: 80, branches: 80 },
        'src/utils/mitt.ts': { lines: 80, branches: 80 },
        'src/utils/message.ts': { lines: 80, branches: 80 },
        'src/utils/responsive.ts': { lines: 80, branches: 80 },
        'src/utils/preventDefault.ts': { lines: 80, branches: 80 },
        'src/utils/propTypes.ts': { lines: 80, branches: 80 },
        'src/utils/progress/index.ts': { lines: 80, branches: 80 },
        'src/utils/globalPolyfills.ts': { lines: 80, branches: 80 },
        'src/utils/sso.ts': { lines: 80, branches: 80 },
        'src/utils/chinaArea.ts': { lines: 80, branches: 80 },
        'src/utils/http/index.ts': { lines: 80, branches: 80 },
        'src/store/modules/user.ts': { lines: 80, branches: 80 },
        'src/store/modules/permission.ts': { lines: 80, branches: 80 },
        'src/store/modules/multiTags.ts': { lines: 80, branches: 80 },
        'src/store/modules/app.ts': { lines: 80, branches: 80 },
        'src/store/modules/settings.ts': { lines: 80, branches: 80 },
        'src/store/modules/epTheme.ts': { lines: 80, branches: 80 },
        'src/utils/localforage/index.ts': { lines: 80, branches: 80 },
        'src/store/index.ts': { lines: 80, branches: 80 },
        'src/store/utils.ts': { lines: 80, branches: 80 },
        'src/components/ReCol/index.ts': { lines: 80, branches: 80 },
        'src/components/ReFlicker/index.ts': { lines: 80, branches: 80 },
        'src/components/ReText/src/index.vue': { lines: 80, branches: 80 },
        'src/components/ReIcon/data.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/hooks.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/iconifyIconOffline.ts': {
          lines: 80,
          branches: 80
        },
        'src/components/ReIcon/src/iconifyIconOnline.ts': {
          lines: 80,
          branches: 80
        },
        'src/components/ReIcon/src/iconfont.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/offlineIcon.ts': { lines: 80, branches: 80 },
        'src/components/ReIcon/src/Select.vue': { lines: 80, branches: 80 },
        'src/components/ReSegmented/src/index.tsx': {
          lines: 80,
          branches: 80
        },
        'src/components/ReAnimateSelector/src/index.vue': {
          lines: 80,
          branches: 80
        },
        'src/components/ReAnimateSelector/src/animate.ts': {
          lines: 80,
          branches: 80
        },
        'src/components/ReCountTo/src/normal/index.tsx': {
          lines: 80,
          branches: 80
        },
        'src/components/ReCountTo/src/normal/props.ts': {
          lines: 80,
          branches: 80
        },
        'src/components/ReCountTo/src/rebound/index.tsx': {
          lines: 80,
          branches: 80
        },
        'src/components/ReCountTo/src/rebound/props.ts': {
          lines: 80,
          branches: 80
        },
        'src/components/ReAuth/src/auth.tsx': { lines: 80, branches: 80 },
        'src/components/RePerms/src/perms.tsx': { lines: 80, branches: 80 },
        'src/components/ReDialog/index.ts': { lines: 80, branches: 80 },
        'src/components/ReDialog/index.vue': { lines: 80, branches: 80 },
        'src/components/ReDrawer/index.ts': { lines: 80, branches: 80 },
        'src/components/ReDrawer/index.vue': { lines: 80, branches: 80 },
        'src/components/ReTypeit/src/index.tsx': { lines: 80, branches: 80 },
        'src/components/RePureTableBar/src/bar.tsx': {
          lines: 80,
          branches: 80
        },
        'src/directives/auth/index.ts': { lines: 80, branches: 80 },
        'src/directives/perms/index.ts': { lines: 80, branches: 80 },
        'src/directives/copy/index.ts': { lines: 80, branches: 80 },
        'src/directives/longpress/index.ts': { lines: 80, branches: 80 },
        'src/directives/optimize/index.ts': { lines: 80, branches: 80 },
        'src/directives/ripple/index.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useTag.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useNav.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useDataThemeChange.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useMultiFrame.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useBoolean.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useLayout.ts': { lines: 80, branches: 80 },
        'src/layout/hooks/useTranslationLang.ts': { lines: 80, branches: 80 },

        'src/layout/components/lay-search/components/SearchResult.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-setting/index.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarBreadCrumb.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarExtraIcon.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarItem.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarLinkItem.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-sidebar/components/SidebarLogo.vue': {
          lines: 80,
          branches: 80
        },
        'src/layout/components/lay-tag/index.vue': {
          lines: 80,
          branches: 80
        },

        'src/layout/components/lay-search/components/SearchHistoryItem.vue': {
          lines: 80,
          branches: 80
        },

        'src/layout/components/lay-footer/index.vue': {
          lines: 80,
          branches: 80
        },

        'src/layout/components/lay-notice/data.ts': {
          lines: 80,
          branches: 80
        },

        'src/layout/components/lay-notice/components/NoticeList.vue': {
          lines: 80,
          branches: 80
        },

        'src/layout/components/lay-tag/components/TagChrome.vue': {
          lines: 80,
          branches: 80
        },

        'src/layout/redirect.vue': {
          lines: 80,
          branches: 80
        },
        'src/views/login/utils/rule.ts': { lines: 80, branches: 80 },
        'src/views/login/utils/verifyCode.ts': { lines: 80, branches: 80 },
        'src/views/login/utils/enums.ts': { lines: 80, branches: 80 },
        'src/views/login/utils/motion.ts': { lines: 80, branches: 80 },
        'src/views/login/utils/static.ts': { lines: 80, branches: 80 },
        'src/views/login/components/LoginPhone.vue': {
          lines: 57,
          branches: 64
        },
        'src/views/login/components/LoginRegist.vue': {
          lines: 57,
          branches: 60
        },
        'src/views/login/components/LoginUpdate.vue': {
          lines: 57,
          branches: 59
        },
        'src/views/welcome/utils.ts': { lines: 80, branches: 80 },
        'src/views/welcome/data.ts': { lines: 80, branches: 80 },
        'src/views/welcome/components/table/columns.tsx': {
          lines: 80,
          branches: 80
        },
        'src/views/monitor/utils.ts': { lines: 80, branches: 80 },
        'src/views/monitor/online/hook.tsx': { lines: 80, branches: 80 },
        'src/views/monitor/logs/system/hook.tsx': { lines: 80, branches: 80 },
        'src/views/monitor/logs/login/hook.tsx': { lines: 80, branches: 80 },
        'src/views/monitor/logs/operation/hook.tsx': {
          lines: 80,
          branches: 80
        },
        'src/views/account-settings/components/Profile.vue': {
          lines: 72,
          branches: 80
        },
        'src/views/account-settings/components/SecurityLog.vue': {
          lines: 80,
          branches: 80
        },

        // ── views/system A 类已测未登记 ──
        'src/views/system/hooks.ts': { lines: 80, branches: 80 },
        'src/views/system/dept/form.vue': { lines: 73, branches: 80 },
        'src/views/system/dept/index.vue': { lines: 66, branches: 80 },
        'src/views/system/dept/utils/hook.tsx': { lines: 79, branches: 80 },
        'src/views/system/dept/utils/rule.ts': { lines: 80, branches: 80 },
        'src/views/system/menu/form.vue': { lines: 68, branches: 80 },
        'src/views/system/menu/index.vue': { lines: 61, branches: 75 },
        'src/views/system/menu/utils/enums.ts': { lines: 80, branches: 80 },
        'src/views/system/menu/utils/hook.tsx': { lines: 80, branches: 77 },
        'src/views/system/menu/utils/rule.ts': { lines: 80, branches: 80 },
        'src/views/system/role/form.vue': { lines: 69, branches: 80 },
        'src/views/system/role/index.vue': { lines: 63, branches: 80 },
        'src/views/system/role/utils/hook.tsx': { lines: 75, branches: 60 },
        'src/views/system/role/utils/rule.ts': { lines: 80, branches: 80 },
        'src/views/system/user/form/index.vue': { lines: 75, branches: 80 },
        'src/views/system/user/form/role.vue': { lines: 80, branches: 80 },
        'src/views/system/user/index.vue': { lines: 62, branches: 68 },
        'src/views/system/user/tree.vue': { lines: 72, branches: 38 },
        'src/views/system/user/utils/hook.tsx': { lines: 69, branches: 51 },
        'src/views/system/user/utils/rule.ts': { lines: 80, branches: 80 }
      }
    }
  }
});

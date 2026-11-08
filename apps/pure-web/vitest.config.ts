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
        // ── 无逻辑：入口 / 根壳 ──
        'src/main.ts', // 无逻辑：bootstrap 入口
        'src/App.vue', // 无逻辑：根壳
        // ── 无逻辑：barrel ──
        'src/directives/index.ts', // 无逻辑：barrel
        'src/components/ReAnimateSelector/index.ts', // 无逻辑：barrel
        'src/components/ReAuth/index.ts', // 无逻辑：barrel
        'src/components/ReCountTo/index.ts', // 无逻辑：barrel
        'src/components/ReCropper/index.ts', // 无逻辑：barrel
        'src/components/ReCropper/src/svg/index.ts', // 无逻辑：barrel
        'src/components/ReCropperPreview/index.ts', // 无逻辑：barrel
        'src/components/ReIcon/index.ts', // 无逻辑：barrel
        'src/components/ReImageVerify/index.ts', // 无逻辑：barrel
        'src/components/RePerms/index.ts', // 无逻辑：barrel
        'src/components/RePureTableBar/index.ts', // 无逻辑：barrel
        'src/components/ReQrcode/index.ts', // 无逻辑：barrel
        'src/components/ReSegmented/index.ts', // 无逻辑：barrel
        'src/components/ReText/index.ts', // 无逻辑：barrel
        'src/components/ReTypeit/index.ts', // 无逻辑：barrel
        'src/views/welcome/components/charts/index.ts', // 无逻辑：barrel
        // ── 无逻辑：plugin / 配置 / 类型 / 静态页 ──
        'src/plugins/*.ts', // 无逻辑：app.use 副作用注册
        'src/config/index.ts', // 无逻辑：纯配置对象
        'src/router/modules/*.ts', // 无逻辑：静态路由配置
        'src/store/types.ts', // 无逻辑：纯类型
        'src/layout/types.ts', // 无逻辑：纯类型
        'src/layout/components/lay-search/types.ts', // 无逻辑：纯类型
        'src/views/empty/index.vue', // 无逻辑：静态页
        'src/views/error/*.vue', // 无逻辑：静态页
        // ── 渲染受限（jsdom 不可达）──
        'src/utils/print.ts', // 渲染受限：DOM 打印不可达
        'src/components/ReImageVerify/**', // 渲染受限：canvas 验证码
        'src/components/ReCropper/**', // 渲染受限：cropper 深交互
        'src/components/ReCropperPreview/**', // 渲染受限：canvas 预览
        'src/components/ReQrcode/**', // 渲染受限：canvas 二维码
        'src/views/welcome/components/charts/*.vue', // 渲染受限：echarts 渲染
        // ── 无逻辑：纯类型 views/system ──
        'src/views/system/dept/utils/types.ts', // 无逻辑：纯类型
        'src/views/system/menu/utils/types.ts', // 无逻辑：纯类型
        'src/views/system/role/utils/types.ts', // 无逻辑：纯类型
        'src/views/system/user/utils/types.ts', // 无逻辑：纯类型
        // ── 无逻辑：纯类型 components type.ts ──
        'src/components/ReDialog/type.ts', // 无逻辑：纯类型
        'src/components/ReDrawer/type.ts', // 无逻辑：纯类型
        'src/components/ReSegmented/src/type.ts', // 无逻辑：纯类型
        'src/components/ReIcon/src/types.ts', // 无逻辑：纯类型
        // ── 页面壳（smoke 已覆盖）──
        'src/layout/index.vue', // 页面壳：布局壳
        'src/layout/frame.vue', // 页面壳：iframe 载体
        'src/layout/components/lay-content/index.vue', // 页面壳：内容区壳
        'src/layout/components/lay-frame/index.vue', // 页面壳：frame 壳
        'src/layout/components/lay-navbar/index.vue', // 页面壳：导航壳
        'src/layout/components/lay-notice/components/NoticeItem.vue', // 页面壳：通知项壳
        'src/layout/components/lay-search/index.vue', // 页面壳：搜索入口壳
        'src/layout/components/lay-search/components/SearchFooter.vue', // 页面壳：搜索底栏壳
        'src/layout/components/lay-sidebar/components/SidebarFullScreen.vue', // 页面壳：全屏按钮壳
        'src/layout/components/lay-sidebar/components/SidebarCenterCollapse.vue', // 页面壳：折叠按钮壳
        'src/layout/components/lay-sidebar/components/SidebarLeftCollapse.vue', // 页面壳：左折叠壳
        'src/layout/components/lay-sidebar/components/SidebarTopCollapse.vue', // 页面壳：顶折叠壳
        'src/views/login/index.vue', // 页面壳：登录壳
        'src/views/login/components/LoginQrCode.vue', // 页面壳：二维码壳
        'src/views/welcome/index.vue', // 页面壳：欢迎页壳
        'src/views/welcome/components/table/index.vue', // 页面壳：表格壳
        'src/views/account-settings/index.vue', // 页面壳：账户设置壳
        'src/views/account-settings/components/AccountManagement.vue', // 页面壳：账户管理壳
        'src/views/account-settings/components/Preferences.vue', // 页面壳：偏好设置壳
        'src/views/monitor/logs/login/index.vue', // 页面壳：登录日志壳
        'src/views/monitor/logs/operation/index.vue', // 页面壳：操作日志壳
        'src/views/monitor/logs/system/index.vue', // 页面壳：系统日志壳
        'src/views/monitor/logs/system/detail.vue', // 页面壳：日志详情壳
        'src/views/monitor/online/index.vue' // 页面壳：在线用户壳
      ],
      thresholds: {
        // 全局聚合兜底：非排除文件 per-file ≥80 ⇒ 聚合必 ≥80
        lines: 80,
        branches: 80,
        // crown-jewel：安全关键逻辑 elevated bar ≥90
        'src/utils/auth.ts': { lines: 90, branches: 90 },
        'src/store/modules/user.ts': { lines: 90, branches: 90 },
        // http/index.ts branches 88：initConfig 回调分支（private static 不可外部设置）
        // + 请求拦截器 error handler（fulfilled 永不抛）为不可达防御性代码
        'src/utils/http/index.ts': { lines: 90, branches: 88 },
        // guards.ts branches 85：line 111 为死代码（whiteList 仅含 '/login'，
        // 已被 line 109 排除，永远不可达）
        'src/router/guards.ts': { lines: 90, branches: 85 },
        'src/utils/tree.ts': { lines: 90, branches: 90 },
        'src/store/modules/permission.ts': { lines: 90, branches: 90 },
        'src/components/ReCol/index.ts': { lines: 80, branches: 80 },
        'src/components/ReFlicker/index.ts': { lines: 80, branches: 80 },
        'src/components/ReText/src/index.vue': { lines: 80, branches: 80 }
      }
    }
  }
});

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
      exclude: ['**/*.d.ts', '**/*.spec.ts'],
      thresholds: {
        'build/utils.ts': { lines: 80, branches: 80 },
        'build/cdn.ts': { lines: 80, branches: 80 },
        'build/compress.ts': { lines: 80, branches: 80 },
        'build/info.ts': { lines: 75, branches: 65 },
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
        }
      }
    }
  }
});

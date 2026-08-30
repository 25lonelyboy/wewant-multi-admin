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
  define: {
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_INFO__: JSON.stringify(__APP_INFO__)
  },
  test: {
    env: { VITE_ROUTER_HISTORY: 'hash' },
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}', 'build/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx,vue}', 'build/*.ts'],
      exclude: ['**/*.d.ts', '**/*.spec.ts'],
      thresholds: {
        'build/utils.ts': { lines: 80, branches: 80 },
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
        'src/components/ReFlicker/index.ts': { lines: 80, branches: 80 }
      }
    }
  }
});

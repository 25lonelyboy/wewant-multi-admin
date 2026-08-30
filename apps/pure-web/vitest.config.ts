import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { alias, __APP_INFO__ } from './build/utils';

// 独立于 vite.config.ts（设计 3.2）：测试环境不加载 fake-server / cdn-import /
// compression 等构建期插件，不继承 rolldownOptions 等 Vite 8 专属构建配置
export default defineConfig({
  resolve: { alias },
  plugins: [vue(), vueJsx()],
  define: {
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_INFO__: JSON.stringify(__APP_INFO__)
  },
  test: {
    env: { VITE_ROUTER_HISTORY: 'hash' },
    environment: 'node',
    include: ['src/**/*.spec.ts', 'build/*.spec.ts'],
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
        'src/store/utils.ts': { lines: 80, branches: 80 }
      }
    }
  }
});

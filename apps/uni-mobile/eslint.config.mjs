//@ts-check
import { vueConfig } from '@multi-admin/eslint-config/vue';

/**
 * uni-mobile ESLint 薄壳：无历史包袱，直接零参消费仓库基线（不做规则放宽），
 * 仅补充 uni-app 运行时注入的全局对象。
 */
export default [
  // 不参与 lint 的文件：构建产物、测试覆盖率报告、本配置文件自身
  {
    ignores: ['dist/**', 'coverage/**', 'eslint.config.mjs']
  },
  // 仓库 Vue 基线（ESLint 只校验，格式化由 Prettier 独占）
  ...vueConfig(),
  {
    // uni-app 运行时注入的全局对象，注册为 readonly 避免 no-undef 误报
    languageOptions: {
      globals: {
        // uni-app 核心 API 对象
        uni: 'readonly',
        // 微信小程序原生 API
        wx: 'readonly',
        // App 端 5+ Runtime API
        plus: 'readonly',
        // 获取应用实例
        getApp: 'readonly',
        // 获取当前页面栈
        getCurrentPages: 'readonly',
        // uni-app 全局命名空间类型
        UniApp: 'readonly'
      }
    }
  }
];

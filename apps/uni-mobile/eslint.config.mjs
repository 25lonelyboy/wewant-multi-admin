//@ts-check
import { vueConfig } from '@multi-admin/eslint-config/vue';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'eslint.config.mjs']
  },
  ...vueConfig,
  {
    languageOptions: {
      globals: {
        uni: 'readonly',
        wx: 'readonly',
        plus: 'readonly',
        getApp: 'readonly',
        getCurrentPages: 'readonly',
        UniApp: 'readonly'
      }
    }
  }
];

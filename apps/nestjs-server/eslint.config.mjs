// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'eslint.config.mjs']
  },
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

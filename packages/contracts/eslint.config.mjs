// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * contracts ESLint 薄壳：零参消费仓库 Node 基线（纯类型 + 常量包，零运行时依赖）。
 */
export default [
  { ignores: ['dist/**', 'eslint.config.mjs'] },
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

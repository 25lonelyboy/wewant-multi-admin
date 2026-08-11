// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * nestjs-server ESLint 薄壳：零参消费仓库 Node 基线（含类型感知 TS 规则），
 * 无规则放宽，守住基线。
 */
export default [
  // 不参与 lint 的文件：构建产物、测试覆盖率报告、本配置文件自身
  {
    ignores: ['dist/**', 'coverage/**', 'eslint.config.mjs']
  },
  // 仓库 Node 基线；tsconfigRootDir 用于类型感知规则定位本包的 tsconfig
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

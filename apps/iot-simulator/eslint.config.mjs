// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * iot-simulator ESLint 薄壳：零参消费仓库 Node 基线（含类型感知 TS 规则），无规则放宽。
 */
export default [
  // 不参与 lint 的文件：依赖、本配置文件自身、探针脚本（与根 scripts/ 及 electron-desktop 同约定）
  {
    ignores: ['node_modules/**', 'scripts/**', 'eslint.config.mjs']
  },
  // tsconfigRootDir 用于类型感知规则定位本包的 tsconfig
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * iot-worker ESLint 薄壳：零参消费仓库 Node 基线（含类型感知 TS 规则），无规则放宽。
 *
 * ⚠️ 本应用**不用 Nest、不开 HTTP**——它是与 HTTP 服务并列的第二个运行时，只消费队列。
 */
export default [
  // 不参与 lint 的文件：构建产物、本配置文件自身、运维脚本（与根 scripts/ 同约定）
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**', 'eslint.config.mjs']
  },
  // tsconfigRootDir 用于类型感知规则定位本包的 tsconfig
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

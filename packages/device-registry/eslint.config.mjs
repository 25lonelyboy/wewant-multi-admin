// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * device-registry ESLint 薄壳：零参消费仓库 Node 基线。
 *
 * ⚠️ 本包**不被模拟器与 pure-web 依赖**——平台的 `deviceId` / `modelCode` 只存在于这里，
 * "设备侧看不到平台标识"由依赖边界保证，不靠约定。
 */
export default [
  { ignores: ['dist/**', 'eslint.config.mjs'] },
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

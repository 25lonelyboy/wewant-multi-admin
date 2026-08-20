// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * nestjs-server ESLint 薄壳：零参消费仓库 Node 基线（含类型感知 TS 规则），
 * 无规则放宽，守住基线。
 */
export default [
  // 不参与 lint 的文件：构建产物、Prisma 生成物、测试覆盖率报告（coverage/coverage-e2e/coverage-merged）、本配置文件自身；
  // *.cjs 为 jest CJS 基建（ts-jest 链式包装 / 覆盖率合并脚本），不在 tsconfig 项目内
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'coverage-e2e/**',
      'coverage-merged/**',
      'src/generated/**',
      'eslint.config.mjs',
      'test/strip-import-meta.cjs',
      'jest.config.cjs',
      'test/jest-e2e.cjs',
      'test/jest.base.cjs',
      'test/merge-coverage.cjs'
    ]
  },
  // 仓库 Node 基线；tsconfigRootDir 用于类型感知规则定位本包的 tsconfig
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];

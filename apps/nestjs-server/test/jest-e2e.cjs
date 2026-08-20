// e2e 配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const { coverageExclude, ...base } = require('./jest.base.cjs');

module.exports = {
  ...base,
  // jest 相对 rootDir 以【配置文件所在目录】解析：本文件位于 test/，
  // 故 rootDir='..' 才是应用根 apps/nestjs-server，与 collectCoverageFrom 的 src/ 前缀口径一致。
  rootDir: '..',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testRegex: '.e2e-spec.ts$',
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  // e2e rootDir=应用根，排除清单加 src/ 前缀重新组装（分设计 §7）
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    ...coverageExclude.map(p => p.replace('!', '!src/'))
  ],
  coverageDirectory: 'coverage-e2e',
  coverageReporters: ['text', 'lcov', 'json']
};

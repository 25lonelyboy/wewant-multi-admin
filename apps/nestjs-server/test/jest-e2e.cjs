// e2e 配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const base = require('./jest.base.cjs');

module.exports = {
  ...base,
  rootDir: '.',
  setupFiles: ['<rootDir>/setup-env.ts'],
  testRegex: '.e2e-spec.ts$',
  globalSetup: '<rootDir>/global-setup.ts',
  globalTeardown: '<rootDir>/global-teardown.ts'
};

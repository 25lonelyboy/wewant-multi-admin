// 单测配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const base = require('./test/jest.base.cjs');

module.exports = {
  ...base,
  rootDir: 'src',
  setupFiles: ['<rootDir>/../test/setup-env.ts'],
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage'
};

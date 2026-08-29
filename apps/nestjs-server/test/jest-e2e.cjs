// e2e 配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const { coverageExclude, ...base } = require('./jest.base.cjs');

module.exports = {
  ...base,
  // 串行执行：所有 spec 共享同一 Postgres 测试库与同一 Redis，
  // 并行 worker 会让 IP 维度限流计数（如登录 5 次/分，键含 127.0.0.1）
  // 与 flushdb/令牌吊销键跨套件互踩（2026-08-29 CI 429 flake 根因）。
  maxWorkers: 1,
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

// test/jest.base.cjs
// 单测/e2e 共享的 jest 基座：transform 链 / mapper / ESM 包穿透，单一事实源（债 #1）。
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@prisma/client/runtime/(.+)\\.mjs$': '@prisma/client/runtime/$1.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@prisma/client|@prisma/adapter-pg|@prisma/driver-adapter-utils)/)'
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      `${__dirname}/strip-import-meta.cjs`,
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node10',
          resolvePackageJsonExports: false,
          allowJs: true
        }
      }
    ]
  }
};

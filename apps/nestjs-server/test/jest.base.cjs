// test/jest.base.cjs
// 单测/e2e 共享的 jest 基座：transform 链 / mapper / ESM 包穿透，单一事实源（债 #1）。

// 覆盖率排除清单（相对 src/ 的规范形态，分设计 §7）：
// generated = Prisma codegen 产物；spec/e2e-spec = 测试自身；d.ts 无可执行语句；main.ts 是 bootstrap 胶水。
// *.module.ts 装配胶水不排除——e2e 运行期真实实例化，正是合并口径的价值所在。
const coverageExclude = [
  '!generated/**',
  '!**/*.spec.ts',
  '!**/*.e2e-spec.ts',
  '!**/*.d.ts',
  '!main.ts'
];

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
  },
  coverageExclude
};

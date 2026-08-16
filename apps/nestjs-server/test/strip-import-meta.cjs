'use strict';
/**
 * Prisma 7 ESM spike（总 spec §12）配套 jest transform：
 * prisma-client 生成器（moduleFormat=esm）在每个生成文件头部注入
 * `import.meta.url` 垫片；jest CJS 管线中该语法非法且完全冗余
 * （CJS 运行时已提供 __dirname/__filename）。
 * 此处在 ts-jest 之前将其剔除，保持 CJS 管线不动。
 *
 * jest 加载 transformer 时会调用 createTransformer 并把 package.json
 * transform 元组里的内联配置传入（与原 "ts-jest" 用法行为一致），
 * DEFAULT_TS_JEST_CONFIG 仅作为未经工厂调用的兜底，两处需保持同步。
 */
const tsJest = require('ts-jest');

// ts-jest 29.x CJS 入口把 createTransformer 挂在 default 上
const { createTransformer: createTsJestTransformer } = tsJest.default || tsJest;

// 剔除 prisma-client ESM 生成物注入的 import.meta.url 垫片
const patch = sourceText =>
  sourceText.replace(
    /import\.meta\.url/g,
    'require("node:url").pathToFileURL(__filename).href'
  );

const DEFAULT_TS_JEST_CONFIG = {
  tsconfig: {
    module: 'commonjs',
    moduleResolution: 'node10',
    resolvePackageJsonExports: false,
    allowJs: true
  }
};

function makeTransformer(tsJestConfig) {
  const transformer = createTsJestTransformer(tsJestConfig);
  return {
    process(sourceText, sourcePath, options) {
      return transformer.process(patch(sourceText), sourcePath, options);
    },
    getCacheKey(sourceText, sourcePath, options) {
      // 缓存键须与 process 输入一致，用 patched 源码计算
      return transformer.getCacheKey(patch(sourceText), sourcePath, options);
    }
  };
}

module.exports = {
  ...makeTransformer(DEFAULT_TS_JEST_CONFIG),
  createTransformer: config => makeTransformer(config ?? DEFAULT_TS_JEST_CONFIG)
};

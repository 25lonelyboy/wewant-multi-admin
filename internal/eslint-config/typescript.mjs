import tseslint from 'typescript-eslint';

/**
 * 带类型检查（type-checked）的 TS 配置，供 Node 端（nestjs-server）使用：
 * 规则可感知类型信息（如 no-floating-promises、no-unsafe-argument）。
 * @param {object} options
 * @param {string} options.tsconfigRootDir tsconfig 解析根目录，传 import.meta.dirname
 */
export function typescriptConfig({ tsconfigRootDir }) {
  return [
    // typescript-eslint 的类型感知推荐规则集
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          // 基于项目 tsconfig 自动解析每个文件所属的 type-checking 工程
          projectService: true,
          // 限定 tsconfig 查找范围在消费方包根，防止误匹配其他包
          tsconfigRootDir
        }
      }
    }
  ];
}

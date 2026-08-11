import js from '@eslint/js';

/**
 * 全仓 ESLint 基线的公共底座：
 * 仅启用 ESLint 官方推荐的 JS 质量规则（no-undef、no-unused-vars 等），
 * 不含任何格式化相关规则——格式化由 Prettier 独占（职责分离模式）。
 * 各组合配置（vue.mjs / node.mjs）在此基础上叠加，
 * 并在配置数组末尾统一追加 eslint-config-prettier 关闭风格冲突规则。
 */
export const baseConfig = [js.configs.recommended];

export default baseConfig;

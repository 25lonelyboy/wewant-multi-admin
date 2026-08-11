// @ts-check

/**
 * pure-web Stylelint 薄壳：一行 extends 仓库基线，
 * 仅在此声明本端差异（tailwind at-rules 白名单与忽略清单）。
 * 职责分离模式：Stylelint 只校验，格式化由 Prettier 独占。
 *
 * @type {import("stylelint").Config}
 */
export default {
  // 仓库共享基线（standard + vue/html 提取 + recess 属性顺序 + scss 支持）
  extends: ['@multi-admin/stylelint-config/base'],
  rules: {
    // tailwind at-rules 白名单（pure-web 专属）；注意 stylelint 规则不做深合并，
    // 基线的 scss 白名单需在此重复声明，否则会覆盖丢失
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'apply',
          'variants',
          'responsive',
          'screen',
          'function',
          'if',
          'each',
          'include',
          'mixin',
          'use'
        ]
      }
    ]
  },
  // 脚本文件与构建报告不含样式，跳过校验
  ignoreFiles: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', 'report.html']
};

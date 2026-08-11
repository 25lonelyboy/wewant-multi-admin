// @ts-check

/**
 * uni-mobile Stylelint 薄壳：一行 extends 仓库基线，
 * 仅豁免 uni-app 生态惯例的 @import 写法。
 * 职责分离模式：Stylelint 只校验，格式化由 Prettier 独占。
 *
 * @type {import("stylelint").Config}
 */
export default {
  extends: ['@multi-admin/stylelint-config/base'],
  rules: {
    // uni-app 生态惯例使用 @import 引入 uni.scss，豁免
    'import-notation': null
  }
};

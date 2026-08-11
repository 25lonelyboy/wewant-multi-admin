// @ts-check

/**
 * 全仓 Stylelint 基线，供 pure-web / uni-mobile 以薄壳方式 extends。
 * 职责分离模式：只做样式质量与属性顺序校验，格式化由 Prettier 独占；
 * Stylelint 15+ 已移除 stylistic 规则，与 Prettier 无冲突，无需额外的 prettier 插件/配置。
 *
 * @type {import("stylelint").Config}
 */
export default {
  extends: [
    // 官方标准规则集（语法错误 + 最佳实践）
    'stylelint-config-standard',
    // 支持从 .vue/.html 文件中提取 <style> 块校验
    'stylelint-config-html/vue',
    // 属性书写顺序规范（需配合 stylelint-order 插件，置于最后以覆盖前面的顺序规则）
    'stylelint-config-recess-order'
  ],
  plugins: [
    // SCSS 语法专属规则（scss/* 命名空间）
    'stylelint-scss',
    // 属性/声明排序校验插件
    'stylelint-order'
  ],
  overrides: [
    {
      // css/html/vue 文件用 postcss-html 解析（提取 style 块）
      files: ['**/*.(css|html|vue)'],
      customSyntax: 'postcss-html'
    },
    {
      // scss 文件用 postcss-scss 解析，并叠加 SCSS 标准规则集；
      // recommended-vue/scss 支持 scss 与 vue 混用场景
      files: ['*.scss', '**/*.scss'],
      customSyntax: 'postcss-scss',
      extends: [
        'stylelint-config-standard-scss',
        'stylelint-config-recommended-vue/scss'
      ]
    }
  ],
  rules: {
    // 类名允许任意风格（BEM/tailwind/驼峰混用的存量工程）
    'selector-class-pattern': null,
    // 允许后写的选择器特异性更高（组件覆盖场景常见）
    'no-descending-specificity': null,
    // SCSS 变量名允许任意风格
    'scss/dollar-variable-pattern': null,
    // 放行 Vue 的 :deep()/:global() 伪类
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['deep', 'global']
      }
    ],
    // 放行 Vue 的 ::v-deep/::v-global/::v-slotted 伪元素
    'selector-pseudo-element-no-unknown': [
      true,
      {
        ignorePseudoElements: ['v-deep', 'v-global', 'v-slotted']
      }
    ],
    // 放行 SCSS 控制指令（@use/@mixin/@include 等，标准 CSS 不认识）
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['function', 'if', 'each', 'include', 'mixin', 'use']
      }
    ],
    // 规则块前需空行，但首层嵌套与注释后豁免
    'rule-empty-line-before': [
      'always',
      {
        ignore: ['after-comment', 'first-nested']
      }
    ],
    // rpx 是 uni-app 核心单位，单位白名单放行
    'unit-no-unknown': [true, { ignoreUnits: ['rpx'] }],
    // 属性值静态解析豁免：含 rpx（uni-app 核心单位）或 scss 变量 $var
    // （变量取值无法静态校验，如 border: 1px solid $border-style）的复合值一律放行
    'declaration-property-value-no-unknown': [
      true,
      { ignoreProperties: { '/.*/': '/rpx|\\$/' } }
    ],
    // 声明块内部书写顺序：变量 → 自定义属性 → at-rules → 声明 → @supports/@media → 嵌套规则；
    // 降为 warning，避免存量样式大面积阻断
    'order/order': [
      [
        'dollar-variables',
        'custom-properties',
        'at-rules',
        'declarations',
        {
          type: 'at-rule',
          name: 'supports'
        },
        {
          type: 'at-rule',
          name: 'media'
        },
        'rules'
      ],
      { severity: 'warning' }
    ]
  }
};

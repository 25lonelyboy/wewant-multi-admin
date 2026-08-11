import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';

/**
 * Tailwind CSS 辅助校验配置（可选叠加），目前仅 pure-web 使用。
 * 只做类名写法的一致性提醒（warn），不阻断构建。
 *
 * @param {object} options
 * @param {string} options.entryPoint Tailwind 样式入口文件相对路径，供插件解析主题变量
 */
export function tailwindConfig({ entryPoint }) {
  return [
    {
      // 只对含模板/JSX 的文件生效（类名只出现在这里）
      files: ['**/*.vue', '**/*.tsx'],
      plugins: {
        'better-tailwindcss': eslintPluginBetterTailwindcss
      },
      rules: {
        // 统一工具类/变量书写语法（如 @apply 与 class 写法的一致性）
        'better-tailwindcss/enforce-consistent-variable-syntax': 'warn',
        // 类名规范化（去除冗余/非标准类名）
        'better-tailwindcss/enforce-canonical-classes': 'warn'
      },
      settings: {
        'better-tailwindcss': {
          // Tailwind 样式入口，插件据此解析主题与自定义变量
          entryPoint,
          // 根字号基准，用于 px/rem 换算类校验
          rootFontSize: 16
        }
      }
    }
  ];
}

export default tailwindConfig;
